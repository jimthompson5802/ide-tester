import { isAbsolute } from 'node:path';

export type Suite = 'editing' | 'git' | 'chat' | 'basic' | 'python';
export type ChatBackend = 'mock' | 'real';
export interface Options {
    chatBackend?: ChatBackend;
    pythonInterpreter?: string;
    build: string;
    suite: Suite;
    output?: 'text' | 'json';
}

export function parseArguments(
    args: string[],
    platform: string = process.platform,
): Options {
    if (platform !== 'darwin') throw new Error('Only macOS is supported');
    const values = new Map<string, string>();
    for (let i = 0; i < args.length; i += 2) {
        const key = args[i];
        const value = args[i + 1];
        if (
            ![
                '--build',
                '--suite',
                '--output',
                '--chat-backend',
                '--python-interpreter',
            ].includes(key) ||
            values.has(key) ||
            !value ||
            value.startsWith('--')
        ) {
            throw new Error(`Invalid or duplicate argument: ${key}`);
        }
        values.set(key, value);
    }
    const build = values.get('--build');
    const suite = values.get('--suite') ?? 'basic';
    if (!build || !isAbsolute(build) || !build.endsWith('.app')) {
        throw new Error('--build requires an absolute installed .app path');
    }
    if (
        suite !== 'editing' &&
        suite !== 'git' &&
        suite !== 'chat' &&
        suite !== 'basic' &&
        suite !== 'python'
    ) {
        throw new Error('--suite must be editing, git, chat, basic, or python');
    }
    const output = values.get('--output');
    if (output !== undefined && output !== 'text' && output !== 'json') {
        throw new Error('--output must be text or json');
    }
    const chatBackend = values.get('--chat-backend') ?? 'mock';
    if (chatBackend !== 'mock' && chatBackend !== 'real')
        throw new Error('--chat-backend must be mock or real');
    const options: Options = {
        build,
        suite,
        chatBackend,
        ...(output ? { output } : {}),
        ...(values.has('--python-interpreter')
            ? { pythonInterpreter: values.get('--python-interpreter') }
            : {}),
    };
    validateBackend(options);
    return options;
}

export function validateBackend(options: Options, foundation = false): void {
    if (options.suite === 'python') {
        if (!options.pythonInterpreter)
            throw new Error('--python-interpreter is required for Python');
        if (foundation)
            throw new Error(
                'Foundation qualification does not cover Python; use smoke',
            );
        if (options.chatBackend === 'real')
            throw new Error(
                'Python-only runs do not select Chat; real backend is unsupported',
            );
    } else if (options.pythonInterpreter !== undefined) {
        throw new Error('--python-interpreter is only supported for Python');
    }
    if (foundation && options.suite === 'git')
        throw new Error(
            'Foundation qualification does not cover Git; use smoke',
        );
    if (options.suite === 'git' && options.chatBackend === 'real')
        throw new Error(
            'Git-only runs do not select Chat; real backend is unsupported',
        );
    if (options.chatBackend === 'real' && foundation)
        throw new Error(
            'Real backend is unavailable for foundation qualification',
        );
    if (options.chatBackend === 'real' && options.suite === 'editing')
        throw new Error(
            'Real backend requires Chat; editing-only runs are unsupported',
        );
}
