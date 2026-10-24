import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import {
    lstat,
    mkdir,
    mkdtemp,
    readFile,
    readdir,
    readlink,
    realpath,
    rm,
    symlink,
    writeFile,
} from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

interface GuardEvidence {
    protectedContentsUnchanged: boolean;
    allowedWriteSucceeded: boolean;
    deniedOperations: string[];
}

// This probe currently implements only the non-GUI write-guard prerequisite.
// Launch is deliberately unavailable until descendant containment is resolved.
const worker = String.raw`
const fs = require('node:fs');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const [root, operation] = process.argv.slice(1);
const protectedRoot = path.join(root, 'protected');
const original = path.join(protectedRoot, 'original.txt');
const metadata = path.join(root, 'metadata.txt');
const append = () => fs.appendFileSync(original, 'changed');
const operations = {
    append,
    create: () => fs.writeFileSync(path.join(protectedRoot, 'created.txt'), 'changed'),
    'rename-file': () => fs.renameSync(original, path.join(root, 'moved.txt')),
    'unlink-file': () => fs.unlinkSync(original),
    'rename-directory': () => fs.renameSync(protectedRoot, path.join(root, 'moved')),
    'unlink-symlink': () => fs.unlinkSync(path.join(protectedRoot, 'link')),
    'write-through-symlink': () => fs.appendFileSync(path.join(root, 'alias'), 'changed'),
    'literal-append': () => fs.appendFileSync(metadata, 'changed'),
    'literal-rename': () => fs.renameSync(metadata, path.join(root, 'moved-metadata.txt')),
    'literal-unlink': () => fs.unlinkSync(metadata),
};
if (operation === 'allowed-write') {
    fs.writeFileSync(path.join(root, 'allowed.txt'), 'allowed');
    process.stdout.write('ALLOWED');
} else if (operation === 'grandchild-append' || operation === 'detached-grandchild-append') {
    const script = "try { require('node:fs').appendFileSync(process.argv[1], 'changed'); process.stdout.write('UNEXPECTED_WRITE'); } catch(e) { if(e.code !== 'EPERM' && e.code !== 'EACCES') throw e; process.stdout.write('DENIED'); }";
    const child = spawnSync(process.execPath, ['-e', script, original], {
        env: process.env,
        encoding: 'utf8',
        timeout: 5000,
        detached: operation === 'detached-grandchild-append',
    });
    if (child.error) throw child.error;
    if (child.status !== 0 || child.signal) throw new Error('Grandchild did not finish');
    process.stdout.write(child.stdout);
} else {
    try {
        operations[operation]();
        process.stdout.write('UNEXPECTED_WRITE');
    } catch (error) {
        if (error.code !== 'EPERM' && error.code !== 'EACCES') throw error;
        process.stdout.write('DENIED');
    }
}
`;

async function snapshot(path: string): Promise<string> {
    const entries: unknown[] = [];
    for (const name of (await readdir(path)).sort()) {
        const item = join(path, name);
        const stat = await lstat(item);
        entries.push({
            name,
            mode: stat.mode,
            size: stat.size,
            mtimeMs: stat.mtimeMs,
            data: stat.isSymbolicLink()
                ? await readlink(item)
                : (await readFile(item)).toString('base64'),
        });
    }
    return JSON.stringify(entries);
}

export async function verifyWriteGuard(): Promise<GuardEvidence> {
    const root = await mkdtemp('/private/tmp/ide-python-guard-');
    const owner = randomUUID();
    await writeFile(join(root, '.owner'), owner, { flag: 'wx', mode: 0o600 });
    const protectedRoot = join(root, 'protected');
    await mkdir(protectedRoot);
    await writeFile(join(protectedRoot, 'original.txt'), 'unchanged');
    await symlink('original.txt', join(protectedRoot, 'link'));
    await symlink(join(protectedRoot, 'original.txt'), join(root, 'alias'));
    const metadata = join(root, 'metadata.txt');
    await writeFile(metadata, 'unchanged metadata');
    const metadataBefore = await readFile(metadata, 'utf8');
    const before = await snapshot(protectedRoot);
    // JSON string quoting escapes quotes/backslashes in this generated fixture path.
    // The canonical disposable path contains no SBPL control characters.
    const canonical = await realpath(protectedRoot);
    if ([...canonical].some((character) => character.charCodeAt(0) < 32))
        throw new Error('Unsupported sandbox path');
    const policy = `(version 1)(allow default)(deny file-write* (subpath ${JSON.stringify(canonical)}) (literal ${JSON.stringify(metadata)}))`;
    const deniedOperations = [
        'append',
        'create',
        'rename-file',
        'unlink-file',
        'rename-directory',
        'unlink-symlink',
        'write-through-symlink',
        'grandchild-append',
        'detached-grandchild-append',
        'literal-append',
        'literal-rename',
        'literal-unlink',
    ];
    for (const operation of [...deniedOperations, 'allowed-write']) {
        try {
            const result = await promisify(execFile)(
                '/usr/bin/sandbox-exec',
                ['-p', policy, process.execPath, '-e', worker, root, operation],
                {
                    env: { PATH: '/usr/bin:/bin', HOME: root, TMPDIR: root },
                    encoding: 'utf8',
                    timeout: 10_000,
                    maxBuffer: 16_384,
                },
            );
            const expected =
                operation === 'allowed-write' ? 'ALLOWED' : 'DENIED';
            if (result.stdout !== expected || result.stderr)
                throw new Error(
                    `Expected ${expected}; received ${result.stdout}`,
                );
        } catch (cause) {
            // Failed verification retains only its own disposable fixture.
            throw new Error(
                `Write guard failed at ${operation}; fixture retained: ${root}`,
                {
                    cause,
                },
            );
        }
    }
    const protectedContentsUnchanged =
        (await snapshot(protectedRoot)) === before &&
        (await readFile(metadata, 'utf8')) === metadataBefore;
    const allowedWriteSucceeded =
        (await readFile(join(root, 'allowed.txt'), 'utf8')) === 'allowed';
    if (!protectedContentsUnchanged || !allowedWriteSucceeded)
        throw new Error(
            `Write guard comparison failed; fixture retained: ${root}`,
        );
    if (
        (await realpath(root)) !== root ||
        (await lstat(root)).isSymbolicLink() ||
        (await readFile(join(root, '.owner'), 'utf8')) !== owner
    )
        throw new Error(`Guard fixture ownership mismatch: ${root}`);
    await rm(root, { recursive: true });
    return {
        protectedContentsUnchanged,
        allowedWriteSucceeded,
        deniedOperations,
    };
}

if (
    process.argv[1] &&
    import.meta.url === pathToFileURL(process.argv[1]).href
) {
    if (process.argv.length !== 3 || process.argv[2] !== '--self-check') {
        process.stderr.write(
            'Only --self-check is available. GUI launch is blocked pending descendant containment.\n',
        );
        process.exitCode = 1;
    } else {
        try {
            process.stdout.write(
                `${JSON.stringify(await verifyWriteGuard(), null, 2)}\n`,
            );
        } catch (error) {
            process.stderr.write(`${String(error)}\n`);
            process.exitCode = 1;
        }
    }
}
