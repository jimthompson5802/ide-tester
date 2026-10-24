import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    mkdtemp,
    mkdir,
    writeFile,
    readFile,
    rm,
    realpath,
    access,
} from 'node:fs/promises';
import { join } from 'node:path';
import { EventEmitter } from 'node:events';
import { runSmoke } from '../src/runner.js';
import { PythonFailure } from '../src/python.js';

async function fixture(): Promise<{
    checkout: string;
    build: string;
    interpreter: string;
}> {
    const checkout = await realpath(
        await mkdtemp('/private/tmp/python-runner-'),
    );
    const build = join(checkout, 'Code.app');
    const resources = join(build, 'Contents/Resources/app');
    await mkdir(join(resources, 'extensions/copilot'), { recursive: true });
    await mkdir(join(build, 'Contents/MacOS'), { recursive: true });
    await writeFile(
        join(build, 'Contents/Info.plist'),
        '<plist><dict><key>CFBundleExecutable</key><string>Electron</string></dict></plist>',
    );
    await writeFile(join(resources, 'package.json'), '{"version":"1.135.0"}');
    await writeFile(
        join(resources, 'extensions/copilot/package.json'),
        '{"name":"copilot-chat","version":"0.63.0"}',
    );
    await writeFile(join(build, 'Contents/MacOS/Electron'), 'not executed', {
        mode: 0o700,
    });
    await mkdir(join(checkout, '.venv/bin'), { recursive: true });
    const interpreter = join(checkout, '.venv/bin/python');
    await writeFile(interpreter, 'arbitrary presence-only fixture');
    for (const name of ['pyproject.toml', 'uv.lock', '.python-version'])
        await writeFile(join(checkout, name), name);
    await mkdir(join(checkout, 'profiles/smoke-python-feasibility'), {
        recursive: true,
    });
    await writeFile(
        join(checkout, 'profiles/smoke-python-feasibility/.owner'),
        'preserved',
    );
    return { checkout, build, interpreter };
}

test('Python runner isolates launch, preserves both profiles and original outcome through uncertain shutdown', async (t) => {
    for (const mode of [
        'passed',
        'stage-renewal',
        'failed',
        'uncertain',
        'guard-failed',
        'mutation',
        'timeout',
    ] as const) {
        const { checkout, build, interpreter } = await fixture();
        t.after(() => rm(checkout, { recursive: true, force: true }));
        let ownedResources = '';
        let pythonCalled = false;
        let lateSettled = false;
        const child = Object.assign(new EventEmitter(), {
            exitCode: mode === 'uncertain' ? null : 0,
            signalCode: null,
        });
        const result = await runSmoke(
            { build, suite: 'python', pythonInterpreter: interpreter },
            checkout,
            async (options) => {
                const args = options!.args!;
                const env = options!.env!;
                assert.ok(args.includes('--no-sandbox'));
                assert.ok(args.includes('--use-inmemory-secretstorage'));
                assert.ok(args.includes('github.copilot-chat'));
                assert.ok(
                    !args.some((arg) =>
                        arg.startsWith('--extensionDevelopmentPath'),
                    ),
                );
                assert.equal(env.VSCODE_COPILOT_CHAT_TOKEN, undefined);
                assert.equal(env.HTTP_PROXY, undefined);
                assert.equal(env.COPILOT_HOME, undefined);
                ownedResources = env.HOME!.slice(0, -'/home'.length);
                assert.match(options!.executablePath!, /protected-vscode$/);
                assert.equal(env.PYTHONDONTWRITEBYTECODE, '1');
                return {
                    process: () => child,
                    firstWindow: async () => ({
                        setDefaultTimeout() {},
                        setDefaultNavigationTimeout() {},
                    }),
                    evaluate: async () => mode !== 'guard-failed',
                    close: async () => {
                        throw new Error('Simulated uncertain owned shutdown');
                    },
                } as never;
            },
            {
                startMock: async () =>
                    assert.fail('Python must not start mock'),
                prepareGit: async () =>
                    assert.fail('Python must not prepare Git'),
                editing: async () =>
                    assert.fail('Python must not edit through editing suite'),
                pythonWorkbench: () =>
                    ({
                        ready: async () => {},
                        verifyTerminalGuard: async () => {
                            await writeFile(
                                join(ownedResources, 'terminal-guard.json'),
                                '{"denied":true}',
                            );
                            return [];
                        },
                    }) as never,
                python: async (
                    _wb,
                    _workspace,
                    _interpreter,
                    evidence,
                    deadline,
                ) => {
                    pythonCalled = true;
                    if (mode === 'stage-renewal') {
                        deadline!.stage('extension-install', 50);
                        await deadline!.perform(async () => {
                            await new Promise<void>((resolve) =>
                                setTimeout(resolve, 5),
                            );
                        });
                        deadline!.stage('editor-save-reopen', 500);
                        await deadline!.perform(async () => {
                            await new Promise<void>((resolve) =>
                                setTimeout(resolve, 100),
                            );
                        });
                        return evidence!;
                    }
                    if (mode === 'timeout') {
                        deadline!.stage('injected-timeout', 1);
                        await deadline!.perform(async () => {
                            await new Promise<void>((resolve) =>
                                setTimeout(resolve, 15),
                            );
                            await access(ownedResources);
                            lateSettled = true;
                        });
                        assert.fail('Expired work must not accept evidence');
                    }
                    if (mode === 'mutation') {
                        await writeFile(interpreter, 'unexpected mutation');
                        return evidence!;
                    }
                    assert.equal(_interpreter.absolute, interpreter);
                    if (mode !== 'passed')
                        throw new PythonFailure(
                            'failed',
                            'Observable Python mismatch',
                            evidence,
                        );
                    return evidence!;
                },
            },
        );
        t.after(() =>
            rm(result.resourcesPath, { recursive: true, force: true }),
        );
        assert.equal(
            result.outcome,
            mode === 'passed' || mode === 'stage-renewal'
                ? 'passed'
                : mode === 'failed' || mode === 'timeout'
                  ? 'failed'
                  : 'harness_error',
        );
        assert.equal(
            result.checks[0].outcome,
            mode === 'passed' || mode === 'stage-renewal' || mode === 'mutation'
                ? 'passed'
                : mode === 'guard-failed'
                  ? 'not_run'
                  : 'failed',
        );
        assert.equal(result.mockRequestEvidence, 'inapplicable');
        assert.equal(result.mockRequestCount, null);
        assert.equal(result.chatSelected, false);
        assert.equal(
            result.cleanup.reservationRetained,
            mode === 'uncertain' || mode === 'mutation',
        );
        await access(result.persistentProfilePath!);
        assert.equal(
            await readFile(
                join(checkout, 'profiles/smoke-python-feasibility/.owner'),
                'utf8',
            ),
            'preserved',
        );
        await assert.rejects(access(join(checkout, 'profiles/smoke-git')));
        await assert.rejects(
            access(join(checkout, 'profiles/smoke-real-chat')),
        );
        assert.equal(
            await readFile(interpreter, 'utf8'),
            mode === 'mutation'
                ? 'unexpected mutation'
                : 'arbitrary presence-only fixture',
        );
        const saved: unknown = JSON.parse(
            await readFile(result.resultPath, 'utf8'),
        );
        assert.ok(saved && typeof saved === 'object');
        if (mode === 'timeout') assert.equal(lateSettled, true);
        if (mode === 'guard-failed') assert.equal(pythonCalled, false);
        if (mode === 'uncertain' || mode === 'mutation')
            await access(join(checkout, 'reports/smoke/.reservation'));
    }
});
