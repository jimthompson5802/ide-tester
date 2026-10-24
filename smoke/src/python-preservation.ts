import { createHash } from 'node:crypto';
import {
    lstat,
    readdir,
    readFile,
    readlink,
    realpath,
    writeFile,
} from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, sep } from 'node:path';

interface PreservationEntry {
    path: string;
    type: 'file' | 'directory' | 'symlink';
    mode: number;
    mtimeMs: number;
    size?: number;
    sha256?: string;
    link?: string;
    children?: string[];
}

export interface PreservationManifest {
    entries: PreservationEntry[];
    missingRoots: string[];
    invocationInterpreter?: string;
    canonicalInterpreter?: string;
}

const directoryRoots = [
    '.venv',
    '.vscode',
    'reports/m1-03/preserved-workspaces',
];
const fileRoots = ['pyproject.toml', 'uv.lock', '.python-version'];

async function retainedStat(
    path: string,
): Promise<Awaited<ReturnType<typeof lstat>> | undefined> {
    try {
        return await lstat(path);
    } catch (error: unknown) {
        if (
            error instanceof Error &&
            'code' in error &&
            error.code === 'ENOENT'
        ) {
            return undefined;
        }
        throw error;
    }
}

function within(root: string, path: string): boolean {
    const suffix = relative(root, path);
    return (
        suffix === '' ||
        (!suffix.startsWith(`..${sep}`) &&
            suffix !== '..' &&
            !isAbsolute(suffix))
    );
}

export async function capturePreservation(
    checkout: string,
): Promise<PreservationManifest> {
    if (!isAbsolute(checkout) || (await realpath(checkout)) !== checkout)
        throw new Error('Redirected retained checkout');
    const retainedInterpreter = join(checkout, '.venv', 'bin', 'python');
    const invocationInterpreter = (await retainedStat(retainedInterpreter))
        ? retainedInterpreter
        : undefined;
    const canonicalInterpreter = invocationInterpreter
        ? await realpath(invocationInterpreter)
        : undefined;
    const entries: PreservationEntry[] = [];
    const missingRoots: string[] = [];
    const visit = async (path: string): Promise<void> => {
        const stat = await lstat(path);
        const item: PreservationEntry = {
            path: relative(checkout, path),
            type: stat.isSymbolicLink()
                ? 'symlink'
                : stat.isDirectory()
                  ? 'directory'
                  : 'file',
            mode: stat.mode,
            mtimeMs: stat.mtimeMs,
        };
        if (stat.isSymbolicLink()) {
            item.link = await readlink(path);
            const target = await realpath(path);
            // Only the retained environment's interpreter may resolve outside the
            // environment. Do not traverse or hash unrelated external targets.
            if (
                !within(join(checkout, '.venv'), target) &&
                target !== canonicalInterpreter
            )
                throw new Error(`Unreviewed external symlink: ${item.path}`);
        } else if (stat.isDirectory()) {
            item.children = (await readdir(path)).sort();
            for (const name of item.children) await visit(join(path, name));
        } else if (stat.isFile()) {
            if (stat.nlink !== 1)
                throw new Error(`Unreviewed hardlink: ${item.path}`);
            item.size = stat.size;
            item.sha256 = createHash('sha256')
                .update(await readFile(path))
                .digest('hex');
        } else throw new Error(`Unsupported preserved entry: ${item.path}`);
        const after = await lstat(path);
        if (
            after.mode !== stat.mode ||
            after.mtimeMs !== stat.mtimeMs ||
            after.size !== stat.size ||
            after.ino !== stat.ino
        )
            throw new Error(
                `Preserved resource changed during inventory: ${item.path}`,
            );
        entries.push(item);
    };
    for (const name of [...directoryRoots, ...fileRoots]) {
        const path = join(checkout, name);
        const stat = await retainedStat(path);
        if (!stat) {
            missingRoots.push(name);
            continue;
        }
        if (stat.isSymbolicLink() || (await realpath(path)) !== path)
            throw new Error(`Redirected retained root: ${name}`);
        const expectDirectory = directoryRoots.includes(name);
        if (expectDirectory ? !stat.isDirectory() : !stat.isFile())
            throw new Error(`Unexpected retained resource type: ${name}`);
        await visit(path);
    }
    entries.sort((left, right) => left.path.localeCompare(right.path));
    return {
        entries,
        missingRoots,
        invocationInterpreter,
        canonicalInterpreter,
    };
}

export async function requirePreservationUnchanged(
    checkout: string,
    before: PreservationManifest,
): Promise<void> {
    if (
        JSON.stringify(await capturePreservation(checkout)) !==
        JSON.stringify(before)
    )
        throw new Error(
            'Preserved resources changed; retain evidence and do not repair',
        );
}

interface ProtectedLaunch {
    executable: string;
    environment: {
        IDE_PYTHON_SANDBOX_POLICY: string;
        IDE_PYTHON_EXECUTABLE: string;
    };
    invocationInterpreter?: string;
    canonicalInterpreter?: string;
    protectedPaths: string[];
}

export async function createProtectedLaunch(
    resources: string,
    executable: string,
    checkout: string,
    sentinel: string,
    canonicalInterpreter?: string,
    invocationInterpreter?: string,
): Promise<ProtectedLaunch> {
    if (
        (await realpath(resources)) !== resources ||
        !within(resources, sentinel) ||
        (await realpath(sentinel)) !== sentinel
    )
        throw new Error('Redirected or unowned guard resources');
    const manifest = await capturePreservation(checkout);
    const directoryTargets = [
        ...directoryRoots.map((name) => join(checkout, name)),
        sentinel,
    ];
    // Only a conventional bin/<executable> layout establishes an installation
    // tree. A standalone supplied file must not deny writes to / or /tmp.
    const interpreters = new Set([
        ...(manifest.canonicalInterpreter
            ? [manifest.canonicalInterpreter]
            : []),
        ...(canonicalInterpreter ? [canonicalInterpreter] : []),
        ...(invocationInterpreter ? [invocationInterpreter] : []),
    ]);
    for (const interpreter of interpreters) {
        const executableDirectory = dirname(interpreter);
        const prefix = dirname(executableDirectory);
        if (
            basename(executableDirectory) === 'bin' &&
            prefix !== '/' &&
            !within(join(checkout, '.venv'), prefix)
        ) {
            directoryTargets.push(prefix);
        }
    }
    const fileTargets = [
        ...fileRoots.map((name) => join(checkout, name)),
        ...interpreters,
    ];
    const quote = (path: string): string => {
        if (
            !isAbsolute(path) ||
            Array.from(path).some(
                (char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127,
            )
        )
            throw new Error('Unsupported sandbox path');
        return JSON.stringify(path);
    };
    const policy = join(resources, 'python-preservation.sb');
    await writeFile(
        policy,
        [
            '(version 1)',
            '(allow default)',
            ...directoryTargets.map(
                (path) =>
                    `(deny file-write* (literal ${quote(path)}) (subpath ${quote(path)}))`,
            ),
            ...fileTargets.map(
                (path) => `(deny file-write* (literal ${quote(path)}))`,
            ),
            '',
        ].join('\n'),
        { flag: 'wx', mode: 0o600 },
    );
    const wrapper = join(resources, 'protected-vscode');
    await writeFile(
        wrapper,
        '#!/bin/sh\nset -eu\nexec /usr/bin/sandbox-exec -f "$IDE_PYTHON_SANDBOX_POLICY" "$IDE_PYTHON_EXECUTABLE" "$@"\n',
        { flag: 'wx', mode: 0o700 },
    );
    return {
        executable: wrapper,
        environment: {
            IDE_PYTHON_SANDBOX_POLICY: policy,
            IDE_PYTHON_EXECUTABLE: executable,
        },
        invocationInterpreter:
            invocationInterpreter ?? manifest.invocationInterpreter,
        canonicalInterpreter:
            canonicalInterpreter ?? manifest.canonicalInterpreter,
        protectedPaths: [...directoryTargets, ...fileTargets],
    };
}
