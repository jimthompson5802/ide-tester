import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseGUIArguments } from './gui-arguments.mjs';
import {
    createGUIReport,
    createGUIRecord,
    saveGUIReport,
    formatGUISummary,
} from './gui-bootstrap-report.mjs';

/** Run before compilation so stale generated code cannot bypass a failed build. */
export async function runGUIBootstrap(argv, services = {}) {
    const packageDirectory =
        services.packageDirectory ?? path.resolve(import.meta.dirname, '..');
    const checkoutDirectory =
        services.checkoutDirectory ?? path.dirname(packageDirectory);
    const output =
        services.output ?? ((message) => process.stdout.write(`${message}\n`));
    const errorOutput =
        services.errorOutput ??
        ((message) => process.stderr.write(`${message}\n`));
    const started = Date.now();
    let options;
    try {
        options = parseGUIArguments(argv, {
            cwd: services.invocationCwd ?? process.cwd(),
            initCwd: (services.environment ?? process.env).INIT_CWD,
        });
    } catch {
        const unavailable = createGUIRecord('Unavailable');
        unavailable.error =
            'Invalid arguments; require --build <application.app> --python-interpreter <path>';
        unavailable.durationMs = Date.now() - started;
        output(formatGUISummary(unavailable));
        return { exitCode: 1 };
    }
    const subscribers = new Set();
    let requested = false;
    let activeBuild;
    let buildSignalled = false;
    let buildSignalError = false;
    const cancellation = {
        get requested() {
            return requested;
        },
        subscribe(listener) {
            subscribers.add(listener);
            return () => subscribers.delete(listener);
        },
    };
    const onSignal = () => {
        if (requested) {
            errorOutput('Owned shutdown is pending; please wait');
            return;
        }
        requested = true;
        errorOutput('Cancellation requested; owned shutdown pending');
        if (activeBuild && !buildSignalled) {
            buildSignalled = true;
            try {
                buildSignalError = !activeBuild.kill('SIGINT');
            } catch {
                buildSignalError = true;
            }
        }
        for (const listener of subscribers) listener();
    };
    process.on('SIGINT', onSignal);
    process.on('SIGTERM', onSignal);
    let directory;
    let batch;
    try {
        ({ directory, batch } = await (
            services.createReport ?? createGUIReport
        )(checkoutDirectory));
    } catch {
        const unavailable = createGUIRecord('Unavailable');
        unavailable.error =
            'Aggregate storage unavailable; no build or GUI started';
        unavailable.durationMs = Date.now() - started;
        if (requested)
            unavailable.cancellation = { reason: 'Cancelled by user' };
        output(formatGUISummary(unavailable));
        process.removeListener('SIGINT', onSignal);
        process.removeListener('SIGTERM', onSignal);
        return { exitCode: 1 };
    }
    const save = async () => {
        batch.durationMs = Date.now() - started;
        await (services.saveReport ?? saveGUIReport)(directory, batch);
    };
    try {
        batch.state = 'running';
        batch.build.state = 'running';
        batch.activeStage = 'build';
        await save();
        if (!requested) {
            const buildCommand = services.buildCommand ?? {
                executable: 'npm',
                args: ['run', 'build'],
            };
            const build = services.spawnBuild
                ? await services.spawnBuild(buildCommand, {
                      cwd: packageDirectory,
                  })
                : await new Promise((resolve) => {
                      try {
                          activeBuild = spawn(
                              buildCommand.executable,
                              buildCommand.args,
                              {
                                  cwd: packageDirectory,
                                  stdio: 'inherit',
                                  detached: true,
                              },
                          );
                          activeBuild.once('error', () =>
                              resolve({
                                  code: null,
                                  signal: null,
                                  error: true,
                              }),
                          );
                          activeBuild.once('close', (code, signal) =>
                              resolve({ code, signal }),
                          );
                      } catch {
                          resolve({ code: null, signal: null, error: true });
                      }
                  });
            activeBuild = undefined;
            if (
                buildSignalError ||
                build.code !== 0 ||
                build.signal ||
                build.error ||
                requested
            ) {
                batch.build.state = 'harness_error';
                batch.build.error = requested
                    ? 'Cancelled by user during build'
                    : 'Build failed; compiled GUI command was not loaded';
            } else {
                batch.build.state = 'passed';
            }
        } else {
            batch.build.state = 'harness_error';
            batch.build.error = 'Cancelled by user before build';
        }
        delete batch.activeStage;
        if (requested) batch.cancellation = { reason: 'Cancelled by user' };
        await save();
        if (batch.build.state !== 'passed' || requested) {
            batch.state = 'completed';
            batch.outcome = 'harness_error';
            await save();
            if (requested && !batch.cancellation) {
                batch.cancellation = { reason: 'Cancelled by user' };
                await save();
            }
            output(formatGUISummary(batch));
            return { exitCode: 1, batch, directory };
        }
        const loaded = await (
            services.loadCommand ??
            (() =>
                import(
                    pathToFileURL(
                        path.join(packageDirectory, 'dist/src/gui-command.js'),
                    ).href
                ))
        )();
        if (requested) {
            batch.cancellation = { reason: 'Cancelled by user' };
            batch.state = 'completed';
            batch.outcome = 'harness_error';
            await save();
            if (requested && !batch.cancellation) {
                batch.cancellation = { reason: 'Cancelled by user' };
                await save();
            }
            output(formatGUISummary(batch));
            return { exitCode: 1, batch, directory };
        }
        const result = await loaded.runGUICommand(options, {
            batch,
            directory,
            save: async () => save(),
            output,
            smokeDirectory: packageDirectory,
            cancellation,
        });
        return {
            exitCode: result.exitCode,
            batch: result.result ?? result.batch,
            directory,
        };
    } catch {
        batch.outcome = 'harness_error';
        batch.state = 'incomplete';
        delete batch.activeStage;
        batch.error =
            'Build, aggregate reporting or command loading failed; no subsequent suite started';
        if (requested) batch.cancellation = { reason: 'Cancelled by user' };
        batch.reportingErrors.push('Aggregate or bootstrap stage failed');
        try {
            await save();
        } catch {
            /* Available terminal evidence remains authoritative for this reporting failure. */
        }
        output(formatGUISummary(batch));
        return { exitCode: 1, batch, directory };
    } finally {
        process.removeListener('SIGINT', onSignal);
        process.removeListener('SIGTERM', onSignal);
    }
}

if (
    process.argv[1] &&
    path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
    const result = await runGUIBootstrap(process.argv.slice(2));
    process.exitCode = result.exitCode;
}
