import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    mkdtemp,
    readFile,
    rm,
    access,
    mkdir,
    writeFile,
    chmod,
} from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { realProfile } from '../src/real-profile.js';
import { runSmoke, runFoundation } from '../src/runner.js';

test('a missing app produces a blocked JSON result without launching the GUI', async (t) => {
    const checkout = await mkdtemp(join(tmpdir(), 'smoke-runner-test-'));
    t.after(() => rm(checkout, { recursive: true, force: true }));
    const result = await runFoundation(
        { build: join(checkout, 'Missing.app'), suite: 'chat' },
        checkout,
    );
    t.after(() => rm(result.resourcesPath, { recursive: true, force: true }));
    assert.equal(result.outcome, 'blocked');
    assert.equal(result.scope, 'foundation');
    assert.equal(result.mockRequestCount, 0);
    assert.match(result.error ?? '', /ENOENT/);
    assert.equal(result.cleanup.reservationRetained, false);
    const saved = JSON.parse(await readFile(result.resultPath, 'utf8'));
    assert.equal(saved.outcome, 'blocked');
    assert.ok(saved.durationMs >= 0);
    await access(result.resultPath);
});

test('uncertain Electron launch retains the reservation and closes the owned mock', async (t) => {
    const checkout = await mkdtemp(join(tmpdir(), 'smoke-launch-test-'));
    t.after(() => rm(checkout, { recursive: true, force: true }));
    const app = await fixtureApp(checkout);
    let mockUrl = '';
    const previous = process.env.UNRELATED_PRIVATE_TOKEN;
    process.env.UNRELATED_PRIVATE_TOKEN = 'must-not-reach-test-app';
    t.after(() => {
        if (previous === undefined) delete process.env.UNRELATED_PRIVATE_TOKEN;
        else process.env.UNRELATED_PRIVATE_TOKEN = previous;
    });
    const result = await runFoundation(
        { build: app, suite: 'chat' },
        checkout,
        async (options) => {
            const token = JSON.parse(
                Buffer.from(
                    options!.env!.VSCODE_COPILOT_CHAT_TOKEN,
                    'base64',
                ).toString(),
            );
            mockUrl = token.endpoints.api;
            assert.equal(options?.timeout, 60000);
            assert.equal(options?.env?.UNRELATED_PRIVATE_TOKEN, undefined);
            throw new Error('Electron launch interrupted');
        },
    );
    t.after(() => rm(result.resourcesPath, { recursive: true, force: true }));
    assert.equal(result.outcome, 'harness_error', JSON.stringify(result));
    assert.equal(result.cleanup.reservationRetained, true);
    assert.match(result.error ?? '', /Electron launch interrupted/);
    await access(join(checkout, 'reports/smoke/.reservation'));
    await assert.rejects(fetch(mockUrl, { signal: AbortSignal.timeout(1000) }));
});

async function fixtureApp(checkout: string) {
    const app = join(checkout, 'Code.app');
    const resources = join(app, 'Contents/Resources/app');
    await mkdir(join(resources, 'extensions/copilot'), { recursive: true });
    await mkdir(join(app, 'Contents/MacOS'), { recursive: true });
    await writeFile(
        join(app, 'Contents/Info.plist'),
        '<plist><dict><key>CFBundleExecutable</key><string>Electron</string></dict></plist>',
    );
    await writeFile(join(resources, 'package.json'), '{"version":"1.135.0"}');
    await writeFile(
        join(resources, 'extensions/copilot/package.json'),
        '{"name":"copilot-chat","version":"0.63.0"}',
    );
    await writeFile(
        join(app, 'Contents/MacOS/Electron'),
        'fixture; never executed',
    );
    await chmod(join(app, 'Contents/MacOS/Electron'), 0o700);
    return app;
}

test('real runs block missing setup and launch only with persistent storage and inapplicable mock evidence', async (t) => {
    const checkout = await mkdtemp(join(tmpdir(), 'smoke-real-launch-'));
    t.after(() => rm(checkout, { recursive: true, force: true }));
    const app = await fixtureApp(checkout);
    const blocked = await runSmoke(
        { build: app, suite: 'chat', chatBackend: 'real' },
        checkout,
        async () => {
            assert.fail('Missing setup must never launch');
        },
    );
    t.after(() => rm(blocked.resourcesPath, { recursive: true, force: true }));
    assert.equal(blocked.outcome, 'blocked');
    assert.match(blocked.error!, /setup:real-chat/);
    assert.equal(blocked.chatBackend, 'real');
    assert.equal(blocked.mockRequestCount, null);
    const profile = await realProfile(checkout, true);
    const settingsPath = join(profile.userData, 'User/settings.json');
    const settings = await readFile(settingsPath, 'utf8');
    await writeFile(settingsPath, '{invalid settings');
    const invalid = await runSmoke(
        { build: app, suite: 'chat', chatBackend: 'real' },
        checkout,
        async () => assert.fail('Invalid configuration must never launch'),
    );
    t.after(() => rm(invalid.resourcesPath, { recursive: true, force: true }));
    assert.equal(invalid.outcome, 'harness_error');
    await writeFile(settingsPath, settings);
    let launched = false;
    const result = await runSmoke(
        { build: app, suite: 'basic', chatBackend: 'real' },
        checkout,
        async (options) => {
            launched = true;
            assert.ok(options!.args!.includes(profile.userData));
            assert.ok(options!.args!.includes(profile.extensions));
            assert.ok(
                !options!.args!.some((arg) =>
                    /inmemory|password-store/.test(arg),
                ),
            );
            assert.equal(options!.env!.VSCODE_COPILOT_CHAT_TOKEN, undefined);
            assert.equal(options!.env!.GITHUB_PAT, undefined);
            assert.equal(options!.env!.HTTP_PROXY, undefined);
            assert.equal(options!.env!.HOME, process.env.HOME);
            throw new Error(
                'Simulated uncertain launch; no application executed',
            );
        },
    );
    t.after(() => rm(result.resourcesPath, { recursive: true, force: true }));
    assert.equal(launched, true);
    assert.equal(result.outcome, 'harness_error');
    assert.equal(result.mockRequestEvidence, 'inapplicable');
    assert.equal(result.requests, null);
    assert.equal(result.mockRequestCount, null);
    assert.deepEqual(
        result.checks.map((check) => check.outcome),
        ['not_run', 'not_run'],
    );
    assert.equal(result.cleanup.reservationRetained, true);
    await access(profile.userData);
    const saved = JSON.parse(await readFile(result.resultPath, 'utf8'));
    assert.equal(saved.chatBackend, 'real');
    assert.equal(saved.persistentProfilePath, profile.userData);
    assert.equal(saved.requests, null);
});

test('Git-only launches with no mock/Chat initialization and preserves its dedicated profile', async (t) => {
    const checkout = await mkdtemp(join(tmpdir(), 'git-only-runner-'));
    t.after(() => rm(checkout, { recursive: true, force: true }));
    const build = await fixtureApp(checkout);
    let called = false;
    const result = await runSmoke(
        { build, suite: 'git' },
        checkout,
        async (options) => {
            called = true;
            const env = options!.env!;
            const args = options!.args!;
            assert.equal(env.VSCODE_COPILOT_CHAT_TOKEN, undefined);
            assert.equal(env.GITHUB_PAT, undefined);
            assert.equal(env.HTTP_PROXY, undefined);
            assert.equal(env.COPILOT_HOME, undefined);
            assert.ok(args.includes('--use-inmemory-secretstorage'));
            assert.ok(args.includes('--disable-extension'));
            assert.ok(args.includes('github.copilot-chat'));
            assert.ok(
                !args.some((x) => x.startsWith('--extensionDevelopmentPath')),
            );
            const userData = args[args.indexOf('--user-data-dir') + 1];
            await assert.rejects(
                access(join(userData, 'User/globalStorage/state.vscdb')),
            );
            assert.match(userData, /profiles\/smoke-git\/user-data$/);
            throw new Error('Simulated uncertain launch');
        },
        {
            startMock: async () =>
                assert.fail('Git-only must never start mock Chat'),
        },
    );
    t.after(() => rm(result.resourcesPath, { recursive: true, force: true }));
    assert.ok(called);
    assert.equal(result.mockRequestEvidence, 'inapplicable');
    assert.equal(result.mockRequestCount, null);
    assert.equal(result.requests, null);
    assert.deepEqual(
        result.checks.map((c) => c.suite),
        ['git'],
    );
    await access(result.persistentProfilePath!);
});

async function applicationFixture(
    options?: { args?: string[] },
    closeFails = false,
) {
    if (options?.args) {
        const userData =
            options.args[options.args.indexOf('--user-data-dir') + 1];
        const dir = join(userData, 'logs/fixture/window1/exthost/vscode.git');
        await mkdir(dir, { recursive: true });
        const { promisify } = await import('node:util');
        const { execFile } = await import('node:child_process');
        const version = (
            await promisify(execFile)('/usr/bin/git', ['--version'])
        ).stdout
            .trim()
            .replace('git version ', '');
        await writeFile(
            join(dir, 'Git.log'),
            `Using git "${version}" from "/usr/bin/git"\n`,
        );
    }
    const page = {
        setDefaultTimeout() {},
        setDefaultNavigationTimeout() {},
        async screenshot() {},
    };
    const app = {
        firstWindow: async () => page,
        process: () => ({ exitCode: 0, signalCode: null }),
        context: () => ({ tracing: { async start() {}, async stop() {} } }),
        async close() {
            if (closeFails) throw new Error('Owned shutdown uncertain');
        },
    };
    return app as never;
}

test('basic runs editing then Chat without Git preparation or the Git profile, and stops on editing failure', async (t) => {
    for (const backend of ['mock', 'real'] as const)
        for (const editingFails of [false, true]) {
            const checkout = await mkdtemp(
                join(tmpdir(), 'editing-chat-runner-'),
            );
            t.after(() => rm(checkout, { recursive: true, force: true }));
            const build = await fixtureApp(checkout);
            const profile =
                backend === 'real'
                    ? await realProfile(checkout, true)
                    : undefined;
            const settingsPath = profile
                ? join(profile.userData, 'User/settings.json')
                : undefined;
            const settings = settingsPath
                ? await readFile(settingsPath, 'utf8')
                : undefined;
            const order: string[] = [];
            let mockStarted = 0;
            let mockClosed = 0;
            const result = await runSmoke(
                { build, suite: 'basic', chatBackend: backend },
                checkout,
                async (options) => {
                    const args = options!.args!;
                    const userData = args[args.indexOf('--user-data-dir') + 1];
                    if (profile) assert.equal(userData, profile.userData);
                    else assert.ok(!userData.includes('smoke-git'));
                    assert.equal(options!.env!.GIT_CONFIG_NOSYSTEM, undefined);
                    return applicationFixture();
                },
                {
                    prepareGit: async () =>
                        assert.fail('basic must not require Git'),
                    git: async () => assert.fail('basic must not run Git'),
                    startMock: async () => {
                        mockStarted++;
                        return {
                            url: 'http://127.0.0.1:12345',
                            requests: () => [],
                            close: async () => {
                                mockClosed++;
                            },
                        };
                    },
                    workbench: () =>
                        ({
                            ready: async () => {},
                            qualifyChat: async () => {
                                order.push('chat');
                                return { session: 'test', turns: [] };
                            },
                        }) as never,
                    editing: async () => {
                        order.push('editing');
                        if (editingFails)
                            throw new Error('Injected editing failure');
                        return { files: [], createdInitiallyAbsent: true };
                    },
                },
            );
            t.after(() =>
                rm(result.resourcesPath, { recursive: true, force: true }),
            );
            assert.deepEqual(
                order,
                editingFails ? ['editing'] : ['editing', 'chat'],
            );
            assert.equal(result.outcome, editingFails ? 'failed' : 'passed');
            assert.deepEqual(
                result.checks.map((c) => c.suite),
                ['editing', 'chat'],
            );
            assert.deepEqual(
                result.checks.map((c) => c.outcome),
                editingFails ? ['failed', 'not_run'] : ['passed', 'passed'],
            );
            assert.equal(mockStarted, backend === 'mock' ? 1 : 0);
            assert.equal(mockClosed, mockStarted);
            assert.equal(result.cleanup.reservationRetained, false);
            await assert.rejects(access(join(checkout, 'profiles/smoke-git')));
            if (settingsPath)
                assert.equal(await readFile(settingsPath, 'utf8'), settings);
        }
});

test('missing Git blocks before launcher or mock and cleanup uncertainty dominates Git outcome', async (t) => {
    const { prepareGit } = await import('../src/git-repository.js');
    const { GitFailure } = await import('../src/git.js');
    const root = await mkdtemp(join(tmpdir(), 'git-preflight-runner-'));
    t.after(() => rm(root, { recursive: true, force: true }));
    const build = await fixtureApp(root);
    const blocked = await runSmoke(
        { build, suite: 'git' },
        root,
        async () => assert.fail('Must not launch'),
        {
            prepareGit: (run) =>
                prepareGit(run, join(run.resources, 'missing-git')),
            startMock: async () => assert.fail('Must not start mock'),
        },
    );
    t.after(() => rm(blocked.resourcesPath, { recursive: true, force: true }));
    assert.equal(blocked.outcome, 'blocked');
    assert.equal(blocked.mockRequestCount, null);
    assert.equal((blocked.checks[0].evidence as any).hash, undefined);
    const failed = await runSmoke(
        { build, suite: 'git' },
        root,
        async (options) => applicationFixture(options, true),
        {
            startMock: async () => assert.fail('Must not start mock'),
            workbench: () => ({ ready: async () => {} }) as never,
            git: async (_wb, _repo, _workspace, evidence) => {
                throw new GitFailure(
                    'failed',
                    'Git functional mismatch',
                    evidence,
                );
            },
        },
    );
    t.after(() => rm(failed.resourcesPath, { recursive: true, force: true }));
    assert.equal(failed.checks[0].outcome, 'failed');
    assert.equal(failed.outcome, 'harness_error');
    assert.equal(failed.cleanup.reservationRetained, true);
});

test('Python missing interpreter blocks without Chat, mock, profile or application launch', async (t) => {
    const checkout = await mkdtemp(join(tmpdir(), 'python-missing-runner-'));
    t.after(() => rm(checkout, { recursive: true, force: true }));
    const build = await fixtureApp(checkout);
    const result = await runSmoke(
        { build, suite: 'python', pythonInterpreter: join(checkout, 'absent') },
        checkout,
        async () => assert.fail('Missing interpreter must not launch'),
        { startMock: async () => assert.fail('Python must not start mock') },
    );
    t.after(() => rm(result.resourcesPath, { recursive: true, force: true }));
    assert.equal(result.outcome, 'blocked');
    assert.equal(result.chatSelected, false);
    assert.equal(result.mockRequestEvidence, 'inapplicable');
    assert.equal(result.mockRequestCount, null);
    assert.equal(result.requests, null);
    assert.match(result.error ?? '', /interpreter/i);
    assert.deepEqual(
        result.checks.map((check) => check.suite),
        ['python'],
    );
    assert.equal(result.cleanup.reservationRetained, false);
    await assert.rejects(access(join(checkout, 'profiles/smoke-python')));
});

test('Python foundation rejects before launch with standalone metadata', async (t) => {
    const checkout = await mkdtemp(join(tmpdir(), 'python-foundation-runner-'));
    t.after(() => rm(checkout, { recursive: true, force: true }));
    const result = await runFoundation(
        {
            build: '/abs/unused.app',
            suite: 'python',
            pythonInterpreter: '/abs/unused',
        },
        checkout,
        async () => assert.fail('Unsupported foundation must not launch'),
    );
    t.after(() => rm(result.resourcesPath, { recursive: true, force: true }));
    assert.equal(result.outcome, 'blocked');
    assert.equal(result.chatSelected, false);
    assert.equal(result.mockRequestCount, null);
    assert.equal(result.requests, null);
    assert.match(result.error ?? '', /Python.*foundation|foundation.*Python/i);
});

test('cancellation before a run acquires no reservation or disposable resources', async (t) => {
    const { Cancellation } = await import('../src/cancellation.js');
    const checkout = await mkdtemp(join(tmpdir(), 'cancel-before-run-'));
    t.after(() => rm(checkout, { recursive: true, force: true }));
    const cancellation = new Cancellation();
    cancellation.request();
    // Exercise the proposed optional API before its implementation exists.
    const invoke = runSmoke as (...args: any[]) => ReturnType<typeof runSmoke>;
    await assert.rejects(
        invoke(
            { build: join(checkout, 'Missing.app'), suite: 'editing' },
            checkout,
            async () => assert.fail('Cancelled run must not launch'),
            {},
            cancellation,
        ),
        /Cancelled by user/,
    );
    await assert.rejects(access(join(checkout, 'reports')));
});

test('cancellation during pending launch owns the late handle and prevents readiness or scenarios', async (t) => {
    const { Cancellation } = await import('../src/cancellation.js');
    const checkout = await mkdtemp(join(tmpdir(), 'cancel-late-launch-'));
    t.after(() => rm(checkout, { recursive: true, force: true }));
    const build = await fixtureApp(checkout);
    const cancellation = new Cancellation();
    let closed = false;
    let nextActions = 0;
    let mockClosed = false;
    const result = await runSmoke(
        { build, suite: 'editing' },
        checkout,
        async () => {
            cancellation.request();
            await new Promise<void>((resolve) => setTimeout(resolve, 10));
            return {
                process: () => ({ exitCode: 0, signalCode: null }),
                firstWindow: async () => {
                    nextActions++;
                    throw new Error('Must not discover a window');
                },
                close: async () => {
                    closed = true;
                },
            } as never;
        },
        {
            startMock: async () => ({
                url: 'http://127.0.0.1:12345',
                requests: () => [],
                close: async () => {
                    mockClosed = true;
                },
            }),
            editing: async () => {
                nextActions++;
                return { files: [], createdInitiallyAbsent: true };
            },
        },
        cancellation,
    );
    t.after(() => rm(result.resourcesPath, { recursive: true, force: true }));
    assert.equal(result.outcome, 'harness_error');
    assert.match(result.error ?? '', /Cancelled by user/);
    assert.equal(nextActions, 0);
    assert.equal(closed, true);
    assert.equal(mockClosed, true);
    assert.equal(result.checks[0].outcome, 'not_run');
    assert.equal(result.cleanup.reservationRetained, false);
    assert.equal(result.cleanup.disposition, 'retained');
    await access(result.resourcesPath);
});

test('active cancellation stops basic scheduling and settles scenario work before releasing the reservation', async (t) => {
    const { Cancellation } = await import('../src/cancellation.js');
    const checkout = await mkdtemp(join(tmpdir(), 'cancel-active-run-'));
    t.after(() => rm(checkout, { recursive: true, force: true }));
    const build = await fixtureApp(checkout);
    const cancellation = new Cancellation();
    let chatCalls = 0;
    let settled = false;
    const result = await runSmoke(
        { build, suite: 'basic' },
        checkout,
        async () => applicationFixture(),
        {
            startMock: async () => ({
                url: 'http://127.0.0.1:12345',
                requests: () => [],
                close: async () => {},
            }),
            workbench: () =>
                ({
                    ready: async () => {},
                    qualifyChat: async () => {
                        chatCalls++;
                        return { session: 'unused', turns: [] };
                    },
                }) as never,
            editing: async () => {
                cancellation.request();
                await new Promise<void>((resolve) => setTimeout(resolve, 15));
                settled = true;
                return { files: [], createdInitiallyAbsent: true };
            },
        },
        cancellation,
    );
    t.after(() => rm(result.resourcesPath, { recursive: true, force: true }));
    assert.equal(result.outcome, 'harness_error');
    assert.equal(chatCalls, 0);
    assert.equal(settled, true);
    assert.deepEqual(
        result.checks.map((check) => check.outcome),
        ['harness_error', 'not_run'],
    );
    assert.equal(result.cleanup.reservationRetained, false);
    assert.equal(result.cleanup.disposition, 'retained');
});

test('cancellation during successful cleanup retains evidence instead of using the earlier pass decision', async (t) => {
    const { Cancellation } = await import('../src/cancellation.js');
    const checkout = await mkdtemp(join(tmpdir(), 'cancel-cleanup-run-'));
    t.after(() => rm(checkout, { recursive: true, force: true }));
    const build = await fixtureApp(checkout);
    const cancellation = new Cancellation();
    const result = await runSmoke(
        { build, suite: 'editing' },
        checkout,
        async () => {
            const app = (await applicationFixture()) as any;
            app.close = async () => {
                cancellation.request();
                cancellation.request();
            };
            return app;
        },
        {
            startMock: async () => ({
                url: 'http://127.0.0.1:12345',
                requests: () => [],
                close: async () => {},
            }),
            workbench: () => ({ ready: async () => {} }) as never,
            editing: async () => ({ files: [], createdInitiallyAbsent: true }),
        },
        cancellation,
    );
    t.after(() => rm(result.resourcesPath, { recursive: true, force: true }));
    assert.equal(result.outcome, 'harness_error');
    assert.equal(result.checks[0].outcome, 'passed');
    assert.equal(result.cleanup.disposition, 'retained');
    assert.equal(result.cleanup.reservationRetained, false);
    await access(result.resourcesPath);
});

test('cancellation during failed cleanup preserves the originating scenario failure', async (t) => {
    const { Cancellation } = await import('../src/cancellation.js');
    const checkout = await mkdtemp(join(tmpdir(), 'cancel-originating-run-'));
    t.after(() => rm(checkout, { recursive: true, force: true }));
    const build = await fixtureApp(checkout);
    const cancellation = new Cancellation();
    const result = await runSmoke(
        { build, suite: 'editing' },
        checkout,
        async () => {
            const app = (await applicationFixture()) as any;
            app.close = async () => {
                cancellation.request();
                throw new Error('Owned close failed');
            };
            return app;
        },
        {
            startMock: async () => ({
                url: 'http://127.0.0.1:12345',
                requests: () => [],
                close: async () => {},
            }),
            workbench: () => ({ ready: async () => {} }) as never,
            editing: async () => {
                throw new Error('Original file mismatch');
            },
        },
        cancellation,
    );
    t.after(() => rm(result.resourcesPath, { recursive: true, force: true }));
    assert.equal(result.outcome, 'harness_error');
    assert.match(result.checks[0].error ?? '', /Original file mismatch/);
    const saved = JSON.parse(await readFile(result.resultPath, 'utf8'));
    assert.equal(saved.originating.outcome, 'failed');
    assert.match(saved.originating.error, /Original file mismatch/);
    assert.equal(saved.cancellation.reason, 'Cancelled by user');
    assert.equal(result.cleanup.reservationRetained, true);
    assert.match(result.cleanup.errors.join(' '), /Owned close failed/);
});

test('a launch handle arriving after cleanup expiry is closed without releasing the uncertain reservation', async (t) => {
    const { Cancellation } = await import('../src/cancellation.js');
    const { EventEmitter } = await import('node:events');
    const checkout = await mkdtemp(join(tmpdir(), 'cancel-expired-launch-'));
    t.after(() => rm(checkout, { recursive: true, force: true }));
    const build = await fixtureApp(checkout);
    const cancellation = new Cancellation();
    const child = Object.assign(new EventEmitter(), {
        exitCode: null as number | null,
        signalCode: null,
    });
    let observeClose!: () => void;
    const closed = new Promise<void>((resolve) => {
        observeClose = resolve;
    });
    const result = await runSmoke(
        { build, suite: 'editing' },
        checkout,
        async () => {
            cancellation.request();
            await new Promise<void>((resolve) => setTimeout(resolve, 60));
            return {
                process: () => child,
                close: async () => {
                    child.exitCode = 0;
                    child.emit('exit');
                    observeClose();
                },
                firstWindow: async () =>
                    assert.fail('Late launch must never discover a window'),
            } as never;
        },
        {
            cleanupTimeoutMs: 15,
            startMock: async () => ({
                url: 'http://127.0.0.1:12345',
                requests: () => [],
                close: async () => {},
            }),
        },
        cancellation,
    );
    t.after(() => rm(result.resourcesPath, { recursive: true, force: true }));
    assert.equal(result.outcome, 'harness_error');
    assert.equal(result.cleanup.reservationRetained, true);
    const reservation = await readFile(
        join(checkout, 'reports/smoke/.reservation'),
    );
    await closed;
    assert.deepEqual(
        await readFile(join(checkout, 'reports/smoke/.reservation')),
        reservation,
    );
    assert.equal(child.exitCode, 0);
    assert.equal(child.listenerCount('exit'), 0);
    await access(result.resourcesPath);
});

test('repeated cancellation during cleanup does not extend its deadline or release unsettled work', async (t) => {
    const { Cancellation } = await import('../src/cancellation.js');
    const checkout = await mkdtemp(join(tmpdir(), 'cancel-expired-cleanup-'));
    t.after(() => rm(checkout, { recursive: true, force: true }));
    const build = await fixtureApp(checkout);
    const cancellation = new Cancellation();
    let closeFinished = false;
    let start = 0;
    const result = await runSmoke(
        { build, suite: 'editing' },
        checkout,
        async () => {
            const app = (await applicationFixture()) as any;
            app.close = async () => {
                start = Date.now();
                cancellation.request();
                await new Promise<void>((resolve) => setTimeout(resolve, 10));
                cancellation.request();
                await new Promise<void>((resolve) => setTimeout(resolve, 70));
                closeFinished = true;
            };
            return app;
        },
        {
            cleanupTimeoutMs: 25,
            startMock: async () => ({
                url: 'http://127.0.0.1:12345',
                requests: () => [],
                close: async () => {},
            }),
            workbench: () => ({ ready: async () => {} }) as never,
            editing: async () => ({ files: [], createdInitiallyAbsent: true }),
        },
        cancellation,
    );
    t.after(() => rm(result.resourcesPath, { recursive: true, force: true }));
    assert.equal(result.outcome, 'harness_error');
    assert.equal(result.cleanup.reservationRetained, true);
    assert.equal(closeFinished, false);
    assert.ok(
        Date.now() - start < 75,
        'Cleanup must return before the unresolved close completes',
    );
    assert.match(result.cleanup.errors.join(' '), /timed out|deadline expired/);
    await new Promise<void>((resolve) => setTimeout(resolve, 90));
    assert.equal(closeFinished, true);
    await access(join(checkout, 'reports/smoke/.reservation'));
});

test('cancellation during resource acquisition settles the owned run before releasing its reservation', async (t) => {
    const { Cancellation } = await import('../src/cancellation.js');
    const { createRun } = await import('../src/resources.js');
    const checkout = await mkdtemp(join(tmpdir(), 'cancel-acquisition-'));
    t.after(() => rm(checkout, { recursive: true, force: true }));
    const cancellation = new Cancellation();
    let acquired = false;
    const result = await runSmoke(
        { build: join(checkout, 'Missing.app'), suite: 'editing' },
        checkout,
        async () => assert.fail('Cancelled acquisition must not launch'),
        {
            createRun: async (root: string) => {
                const run = await createRun(root);
                cancellation.request();
                await new Promise<void>((resolve) => setTimeout(resolve, 10));
                await access(run.reservation);
                acquired = true;
                return run;
            },
        } as any,
        cancellation,
    );
    t.after(() => rm(result.resourcesPath, { recursive: true, force: true }));
    assert.equal(acquired, true);
    assert.equal(result.outcome, 'harness_error');
    assert.equal(result.cleanup.reservationRetained, false);
    assert.equal(result.cleanup.disposition, 'retained');
});

test('real Chat cancellation retains a sanitized failure observed before pending diagnostics', async (t) => {
    const { Cancellation, CancellationError } =
        await import('../src/cancellation.js');
    const checkout = await mkdtemp(join(tmpdir(), 'cancel-chat-origin-'));
    t.after(() => rm(checkout, { recursive: true, force: true }));
    const build = await fixtureApp(checkout);
    await realProfile(checkout, true);
    const cancellation = new Cancellation();
    const result = await runSmoke(
        { build, suite: 'chat', chatBackend: 'real' },
        checkout,
        async () => applicationFixture(),
        {
            workbench: () =>
                ({
                    ready: async () => {},
                    qualifyChat: async (...args: any[]) => {
                        const evidence = args[6];
                        evidence.originatingFailure = {
                            outcome: 'harness_error',
                            error: 'Chat UI/session contract failed (open-session)',
                        };
                        cancellation.request();
                        throw new CancellationError();
                    },
                }) as never,
        },
        cancellation,
    );
    t.after(() => rm(result.resourcesPath, { recursive: true, force: true }));
    assert.equal(result.outcome, 'harness_error');
    assert.deepEqual(result.originating, {
        outcome: 'harness_error',
        error: 'Chat UI/session contract failed (open-session)',
    });
});
