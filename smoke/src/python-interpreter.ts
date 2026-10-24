import { realpath, stat } from 'node:fs/promises';
import { resolve } from 'node:path';

export class PythonInterpreterPrerequisite extends Error {}

export interface PythonInterpreter {
    supplied: string;
    absolute: string;
    canonical: string;
}

export async function preparePythonInterpreter(
    supplied: string,
    cwd = process.cwd(),
): Promise<PythonInterpreter> {
    const absolute = resolve(cwd, supplied);
    let canonical: string;
    try {
        if (!(await stat(absolute)).isFile()) {
            throw new Error('Interpreter path is not a file');
        }
        canonical = await realpath(absolute);
    } catch (cause) {
        throw new PythonInterpreterPrerequisite(
            `Python interpreter file unavailable: ${absolute}`,
            { cause },
        );
    }
    return { supplied, absolute, canonical };
}
