import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
    mkdir,
    writeFile,
    readFile,
    realpath,
    lstat,
    glob,
} from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import type { Run } from './resources.js';

export type GitOutcome = 'blocked' | 'failed' | 'harness_error';
export interface GitEvidence {
    stage: string;
    completedStages: string[];
    filename: string;
    expectedMessage: string;
    initialized?: boolean;
    version?: string;
    graphMessage?: string;
    graphVisible?: boolean;
    hash?: string;
    message?: string;
    author?: string;
    bytes?: number;
    sha256?: string;
    trackedPaths?: string[];
    log?: string;
}
export class GitFailure extends Error {
    constructor(
        readonly outcome: GitOutcome,
        message: string,
        public evidence?: GitEvidence,
    ) {
        super(message);
    }
}

// Deliberately excludes Git routing/config/author overrides, proxies and credentials.
export function gitEnvironment(
    inherited: NodeJS.ProcessEnv,
): Record<string, string> {
    const env: Record<string, string> = {};
    for (const key of [
        'HOME',
        'PATH',
        'TMPDIR',
        'LANG',
        'LC_ALL',
        'LC_CTYPE',
        'USER',
        'LOGNAME',
        'SHELL',
        'SECURITYSESSIONID',
        '__CF_USER_TEXT_ENCODING',
    ]) {
        if (inherited[key] !== undefined) env[key] = inherited[key];
    }
    return env;
}

export async function gitCommand(
    executable: string,
    args: string[],
    cwd: string,
    env: NodeJS.ProcessEnv,
    timeout = 10_000,
): Promise<string> {
    try {
        return (
            await promisify(execFile)(executable, args, {
                cwd,
                env,
                timeout,
                killSignal: 'SIGKILL',
                maxBuffer: 65_536,
            })
        ).stdout;
    } catch (cause) {
        const code = (cause as NodeJS.ErrnoException).code;
        if (code === 'ENOENT')
            throw new GitFailure(
                'blocked',
                'Git executable or working directory unavailable',
            );
        // No raw stderr, environment, command line or arbitrary subprocess output in diagnostics.
        const error = new GitFailure(
            'harness_error',
            (cause as { killed?: boolean }).killed
                ? 'Git subprocess timed out and was terminated'
                : `Git subprocess failed (exit ${typeof code === 'number' ? code : 'unknown'})`,
        );
        Object.assign(error, { exitCode: code });
        throw error;
    }
}
const absent = async (path: string) => {
    try {
        await lstat(path);
        return false;
    } catch (cause) {
        if ((cause as NodeJS.ErrnoException).code === 'ENOENT') return true;
        throw cause;
    }
};
async function canonical(path: string, directory: boolean) {
    try {
        if (
            (await realpath(path)) === path &&
            (directory
                ? (await lstat(path)).isDirectory()
                : (await lstat(path)).isFile())
        )
            return;
    } catch {
        /* Missing or inaccessible owned state is not a product assertion. */
    }
    throw new GitFailure('harness_error', 'Git resource ownership mismatch');
}

export async function prepareGit(
    run: Pick<Run, 'resources' | 'workspace' | 'id'>,
    executable = '/usr/bin/git',
) {
    await canonical(run.resources, true);
    await canonical(join(run.resources, '.owner'), false);
    await canonical(run.workspace, true);
    if (
        dirname(run.workspace) !== run.resources ||
        (await readFile(join(run.resources, '.owner'), 'utf8')) !== run.id
    ) {
        throw new GitFailure(
            'harness_error',
            'Git workspace ownership mismatch',
        );
    }
    if (process.platform === 'darwin' && executable === '/usr/bin/git') {
        try {
            await promisify(execFile)('/usr/bin/xcode-select', ['-p'], {
                timeout: 5000,
                maxBuffer: 4096,
            });
        } catch {
            throw new GitFailure(
                'blocked',
                'Git command-line tools unavailable',
            );
        }
    }
    const isolation = join(run.resources, 'git-isolation');
    await mkdir(isolation);
    const globalConfig = join(isolation, 'empty-config');
    const hooks = join(isolation, 'empty-hooks');
    await writeFile(globalConfig, '', { flag: 'wx' });
    await mkdir(hooks);
    const env = {
        ...gitEnvironment(process.env),
        GIT_CONFIG_GLOBAL: globalConfig,
        GIT_CONFIG_SYSTEM: globalConfig,
        GIT_CONFIG_NOSYSTEM: '1',
        GIT_TERMINAL_PROMPT: '0',
    };
    const execute = (args: string[]) =>
        gitCommand(executable, args, run.workspace, env);
    const version = (await execute(['--version'])).trim();
    if (!/^git version [\w. ()-]+$/.test(version))
        throw new GitFailure('harness_error', 'Malformed Git version evidence');
    async function ownership() {
        await canonical(run.workspace, true);
        await canonical(join(run.workspace, '.git'), true);
        for (const [name, directory] of [
            ['HEAD', false],
            ['config', false],
            ['objects', true],
            ['refs', true],
        ] as const) {
            await canonical(join(run.workspace, '.git', name), directory);
        }
        if (!(await absent(join(run.workspace, '.git/commondir'))))
            throw new GitFailure(
                'harness_error',
                'Redirected Git common directory',
            );
        for (const name of ['index', 'packed-refs'])
            if (!(await absent(join(run.workspace, '.git', name))))
                await canonical(join(run.workspace, '.git', name), false);
        if (
            (await execute(['rev-parse', '--show-toplevel'])).trim() !==
                run.workspace ||
            (await execute(['rev-parse', '--absolute-git-dir'])).trim() !==
                join(run.workspace, '.git')
        ) {
            throw new GitFailure(
                'harness_error',
                'Git repository root mismatch',
            );
        }
    }
    return {
        env,
        version,
        executable,
        async requireUninitialized() {
            if (!(await absent(join(run.workspace, '.git'))))
                throw new GitFailure(
                    'harness_error',
                    'Git workspace already contains a repository',
                );
            try {
                await execute(['rev-parse', '--show-toplevel']);
            } catch (cause) {
                if (
                    cause instanceof GitFailure &&
                    (cause as GitFailure & { exitCode?: number }).exitCode ===
                        128
                )
                    return;
                throw cause;
            }
            throw new GitFailure(
                'harness_error',
                'Git workspace has an enclosing repository',
            );
        },
        async configure() {
            await ownership();
            let unborn = false;
            try {
                await execute(['rev-parse', '--verify', 'HEAD']);
            } catch (cause) {
                if (
                    cause instanceof GitFailure &&
                    (cause as GitFailure & { exitCode?: number }).exitCode ===
                        128
                )
                    unborn = true;
                else throw cause;
            }
            if (!unborn || (await execute(['ls-files', '--stage'])).trim())
                throw new GitFailure(
                    'failed',
                    'Expected unborn HEAD and empty initial index',
                );
            for (const [key, value] of [
                ['user.name', 'Smoke Test'],
                ['user.email', 'smoke-test@example.invalid'],
                ['commit.gpgsign', 'false'],
                ['tag.gpgsign', 'false'],
                ['core.hooksPath', hooks],
                ['credential.helper', ''],
            ]) {
                await execute(['config', '--local', key, value]);
            }
        },
        async requireStaged() {
            await ownership();
            if (
                (await execute(['diff', '--cached', '--name-only', '-z'])) !==
                'git-smoke.txt\0'
            )
                throw new GitFailure(
                    'failed',
                    'Git index must contain only git-smoke.txt',
                );
        },
        async verify(message: string, content: string, evidence?: GitEvidence) {
            await ownership();
            const head = await execute(['rev-parse', '--verify', 'HEAD']).catch(
                (cause) => {
                    if (
                        cause instanceof GitFailure &&
                        (cause as GitFailure & { exitCode?: number })
                            .exitCode === 128
                    )
                        throw new GitFailure(
                            'failed',
                            'Expected Git commit is missing',
                        );
                    throw cause;
                },
            );
            const hash = head.trim();
            if (!/^[a-f0-9]{40}$/.test(hash))
                throw new GitFailure(
                    'harness_error',
                    'Malformed Git commit hash evidence',
                );
            if (evidence) evidence.hash = hash;
            const observedMessage = (
                await execute(['show', '-s', '--format=%s', 'HEAD'])
            ).trimEnd();
            if (evidence && observedMessage === message)
                evidence.message = observedMessage;
            const author = (
                await execute(['show', '-s', '--format=%an <%ae>', 'HEAD'])
            ).trim();
            if (
                evidence &&
                author === 'Smoke Test <smoke-test@example.invalid>'
            )
                evidence.author = author;
            const paths = await execute([
                'ls-tree',
                '-r',
                '--name-only',
                '-z',
                'HEAD',
            ]);
            if (evidence)
                evidence.trackedPaths = paths.split('\0').filter(Boolean);
            const blob = await execute(['show', 'HEAD:git-smoke.txt']).catch(
                (cause) => {
                    if (
                        cause instanceof GitFailure &&
                        (cause as GitFailure & { exitCode?: number })
                            .exitCode === 128
                    )
                        throw new GitFailure(
                            'failed',
                            'Expected committed Git blob is missing',
                        );
                    throw cause;
                },
            );
            if (evidence) {
                evidence.bytes = Buffer.byteLength(blob);
                evidence.sha256 = createHash('sha256')
                    .update(blob)
                    .digest('hex');
            }
            const log = (
                await execute(['log', '-1', '--format=%H %s'])
            ).trimEnd();
            if (evidence && log === `${hash} ${message}`) evidence.log = log;
            if (
                observedMessage !== message ||
                (await execute(['rev-list', '--count', 'HEAD'])).trim() !==
                    '1' ||
                (
                    await execute(['rev-list', '--max-parents=0', 'HEAD'])
                ).trim() !== hash ||
                author !== 'Smoke Test <smoke-test@example.invalid>' ||
                paths !== 'git-smoke.txt\0' ||
                blob !== content ||
                (await execute(['diff', '--cached', '--name-only'])).trim() ||
                (await execute(['remote'])).trim() ||
                log !== `${hash} ${message}` ||
                (await execute(['rev-parse', 'HEAD'])).trim() !== hash
            ) {
                throw new GitFailure(
                    'failed',
                    'Git commit, history, author, index or blob did not match',
                );
            }
            return {
                hash,
                message: observedMessage,
                author,
                bytes: Buffer.byteLength(blob),
                sha256: createHash('sha256').update(blob).digest('hex'),
                trackedPaths: ['git-smoke.txt'],
                log,
            };
        },
    };
}
export type GitRepository = Awaited<ReturnType<typeof prepareGit>>;

export async function gitExtensionLogs(userData: string): Promise<string[]> {
    const logs: string[] = [];
    for await (const path of glob('logs/*/window1/exthost/vscode.git/Git.log', {
        cwd: userData,
    }))
        logs.push(path);
    return logs;
}

export async function requireGitExtension(
    userData: string,
    repository: Pick<GitRepository, 'version' | 'executable'>,
    previous: readonly string[],
    timeout = 15_000,
): Promise<void> {
    const deadline = Date.now() + timeout;
    do {
        const logs = (await gitExtensionLogs(userData)).filter(
            (path) => !previous.includes(path),
        );
        if (logs.length > 1)
            throw new GitFailure(
                'harness_error',
                'Ambiguous Git extension log evidence',
            );
        if (logs.length === 1) {
            const path = join(userData, logs[0]);
            await canonical(path, false);
            const text = await readFile(path, 'utf8');
            if (Buffer.byteLength(text) > 262_144)
                throw new GitFailure(
                    'harness_error',
                    'Git extension log evidence exceeds bound',
                );
            const match = /Using git "([^"\n]+)" from "([^"\n]+)"/.exec(text);
            if (match) {
                if (
                    `git version ${match[1]}` !== repository.version ||
                    match[2] !== repository.executable
                )
                    throw new GitFailure(
                        'blocked',
                        'VS Code selected a different Git executable/version; persistent settings were left unchanged',
                    );
                return;
            }
        }
        if (Date.now() >= deadline) break;
        await new Promise((resolve) =>
            setTimeout(
                resolve,
                Math.min(100, Math.max(1, deadline - Date.now())),
            ),
        );
    } while (true);
    throw new GitFailure(
        'harness_error',
        'Fresh Git extension executable evidence unavailable',
    );
}
