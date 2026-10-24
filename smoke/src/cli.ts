import { writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { reportResult } from './report.js';
import { parseArguments } from './arguments.js';
import { createRun, finishRun, type Run } from './resources.js';
import {
    Cancellation,
    CancellationError,
    installCancellationHandlers,
} from './cancellation.js';
import { runFoundation, runSmoke } from './runner.js';

export const checkoutRoot = resolve(
    fileURLToPath(new URL('../../../', import.meta.url)),
);

export async function executeCLI(
    args: string[],
    checkout = checkoutRoot,
    qualify = false,
    output: (message: string) => void = console.log,
    cancellation = new Cancellation(),
): Promise<number> {
    const started = Date.now();
    const suiteIndex = args.indexOf('--suite');
    const requestedSuite = suiteIndex >= 0 ? args[suiteIndex + 1] : undefined;
    const standalone = requestedSuite === 'git' || requestedSuite === 'python';
    const chatSelected = standalone
        ? false
        : qualify ||
          requestedSuite === 'chat' ||
          requestedSuite === 'basic' ||
          requestedSuite === undefined;
    const backendIndex = args.indexOf('--chat-backend');
    const chatBackend: 'real' | 'mock' =
        backendIndex >= 0 && args[backendIndex + 1] === 'real'
            ? 'real'
            : 'mock';
    const mockApplicable = chatBackend === 'mock' && !standalone;
    // Recover the requested presentation even when other arguments are invalid.
    const outputIndex = args.indexOf('--output');
    const mode =
        outputIndex >= 0 && args[outputIndex + 1] === 'json' ? 'json' : 'text';
    try {
        cancellation.check();
        let options;
        let prerequisite: string | undefined;
        try {
            options = parseArguments(args);
        } catch (error) {
            prerequisite = String(error);
        }
        if (prerequisite || !options) {
            let acquired: Run | undefined;
            let cleanupDeadline: number | undefined;
            try {
                await cancellation.perform(async () => {
                    acquired = await createRun(checkout);
                });
            } catch (cause) {
                if (!(cause instanceof CancellationError)) throw cause;
                // A cancelled wait does not abandon reservation acquisition.
                cleanupDeadline = Date.now() + 120_000;
                await cancellation.settle(
                    Math.max(1, cleanupDeadline - Date.now()),
                );
            }
            if (!acquired)
                throw new Error(
                    'Run acquisition did not return owned resources',
                );
            const run = acquired;
            const cleanup = await finishRun(run, false, [], {
                deadline: cleanupDeadline ?? Date.now() + 120_000,
            });
            const resultPath = join(run.report, 'result.json');
            const result = {
                runId: run.id,
                scope: qualify ? 'foundation' : 'selected-suites',
                chatBackend,
                chatSelected,
                outcome: 'blocked',
                error: prerequisite,
                suites: options?.suite ?? requestedSuite,
                startedAt: new Date(started).toISOString(),
                durationMs: Date.now() - started,
                versions: {
                    node: process.version,
                    platform: process.platform,
                    architecture: process.arch,
                },
                mockRequestEvidence: mockApplicable
                    ? 'applicable'
                    : 'inapplicable',
                mockRequestCount: mockApplicable ? 0 : null,
                requests: mockApplicable ? [] : null,
                cleanup,
                resourcesPath: run.resources,
                resultPath,
            };
            await writeFile(resultPath, JSON.stringify(result, null, 2));
            return await reportResult(result, mode, output, cancellation);
        }
        const result = qualify
            ? await runFoundation(options, checkout, undefined, cancellation)
            : await runSmoke(
                  options,
                  checkout,
                  undefined,
                  undefined,
                  cancellation,
              );
        return await reportResult(result, mode, output, cancellation);
    } catch (error) {
        // An existing or uncertain reservation must never be removed on this path.
        return await reportResult(
            {
                chatBackend,
                chatSelected,
                mockRequestEvidence: mockApplicable
                    ? 'applicable'
                    : 'inapplicable',
                mockRequestCount: mockApplicable ? 0 : null,
                requests: mockApplicable ? [] : null,
                outcome: 'harness_error',
                error: cancellation.requested
                    ? 'Cancelled by user'
                    : String(error),
                ...(cancellation.requested
                    ? {
                          cancellation: { reason: 'Cancelled by user' },
                          ...(!(error instanceof CancellationError)
                              ? {
                                    originating: {
                                        outcome: 'harness_error',
                                        error: String(error),
                                    },
                                }
                              : {}),
                      }
                    : {}),
            },
            mode,
            output,
            cancellation,
        );
    }
}

if (
    process.argv[1] &&
    import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
    const cancellation = new Cancellation();
    const dispose = installCancellationHandlers(cancellation, (message) => {
        process.stderr.write(message + '\n');
    });
    try {
        process.exitCode = await executeCLI(
            process.argv.slice(2),
            undefined,
            false,
            undefined,
            cancellation,
        );
    } finally {
        dispose();
    }
}
