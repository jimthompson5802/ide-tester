import { isAbsolute, resolve } from 'node:path';

export function parseGUIArguments(args, context = {}) {
    const values = new Map();
    for (let index = 0; index < args.length; index += 2) {
        const key = args[index];
        const value = args[index + 1];
        if (
            !['--build', '--python-interpreter'].includes(key) ||
            values.has(key) ||
            !value ||
            value.startsWith('--')
        ) {
            throw new Error(`Invalid or duplicate argument: ${key}`);
        }
        values.set(key, value);
    }
    const buildPath = values.get('--build');
    if (!buildPath || !isAbsolute(buildPath) || !buildPath.endsWith('.app')) {
        throw new Error('--build requires an absolute installed .app path');
    }
    const supplied = values.get('--python-interpreter');
    if (!supplied) {
        throw new Error('--python-interpreter is required');
    }
    const invocationCwd = context.initCwd || context.cwd || process.cwd();
    return {
        buildPath,
        pythonInterpreter: resolve(invocationCwd, supplied),
        invocationCwd,
    };
}
