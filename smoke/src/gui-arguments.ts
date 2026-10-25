import { fileURLToPath } from 'node:url';

export interface GUIOptions {
    buildPath: string;
    pythonInterpreter: string;
    invocationCwd: string;
}
export interface GUIArgumentContext {
    cwd?: string;
    initCwd?: string;
}

// Dynamic URL resolves the same uncompiled parser from source and compiled output.
const scripts = import.meta.url.includes('/dist/src/') ? '../..' : '..';
const parserURL = new URL(
    `${scripts}/scripts/gui-arguments.mjs`,
    import.meta.url,
);
const parser: {
    parseGUIArguments(args: string[], context: GUIArgumentContext): GUIOptions;
} = await import(fileURLToPath(parserURL));

export function parseGUIArguments(
    args: string[],
    context: GUIArgumentContext = {},
): GUIOptions {
    return parser.parseGUIArguments(args, context);
}
