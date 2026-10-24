import { lstat, readFile, realpath } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { createHash } from 'node:crypto';

function destination(workspace: string, name: string): string {
    if (!name || basename(name) !== name || name === '.' || name === '..')
        throw new Error('Invalid owned destination');
    return join(workspace, name);
}

export async function requireAbsent(
    workspace: string,
    name: string,
): Promise<void> {
    const path = destination(workspace, name);
    try {
        await lstat(path);
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
        throw error;
    }
    throw new Error(`Destination already exists: ${path}`);
}

export async function verifySavedFile(
    workspace: string,
    name: string,
    expected: string,
) {
    const path = destination(workspace, name);
    if (
        (await realpath(workspace)) !== workspace ||
        (await realpath(path)) !== path ||
        !(await lstat(path)).isFile()
    ) {
        throw new Error(
            `Saved destination is not the exact owned file: ${path}`,
        );
    }
    const bytes = await readFile(path);
    if (!bytes.equals(Buffer.from(expected, 'utf8')))
        throw new Error(`Saved UTF-8 bytes differ: ${path}`);
    return {
        name,
        path,
        bytes: bytes.length,
        sha256: createHash('sha256').update(bytes).digest('hex'),
    };
}
