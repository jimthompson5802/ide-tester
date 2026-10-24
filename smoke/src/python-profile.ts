import {
    mkdir,
    readFile,
    writeFile,
    realpath,
    lstat,
    rename,
    readdir,
} from 'node:fs/promises';
import { join } from 'node:path';
import { commonSettings } from './profile.js';
import { requireClosedProfile, type ProfilePaths } from './real-profile.js';
export class PythonProfileFailure extends Error {
    constructor(
        public readonly outcome: 'blocked' | 'harness_error',
        message: string,
    ) {
        super(message);
    }
}

const owner = 'ide-tester:smoke-python:v1';
async function owned(path: string, directory: boolean): Promise<void> {
    if (
        (await realpath(path)) !== path ||
        !(directory
            ? (await lstat(path)).isDirectory()
            : (await lstat(path)).isFile())
    )
        throw new PythonProfileFailure(
            'harness_error',
            'Python profile ownership mismatch',
        );
}
export async function pythonProfile(
    checkout: string,
    resources: string,
): Promise<ProfilePaths> {
    const parent = join(await realpath(checkout), 'profiles');
    await mkdir(parent, { recursive: true });
    await owned(parent, true);
    const root = join(parent, 'smoke-python');
    let created = false;
    try {
        await mkdir(root);
        created = true;
    } catch (cause) {
        if ((cause as NodeJS.ErrnoException).code !== 'EEXIST') throw cause;
    }
    if (created)
        await writeFile(join(root, '.owner'), owner, {
            flag: 'wx',
            mode: 0o600,
        });
    await owned(root, true);
    await owned(join(root, '.owner'), false);
    if ((await readFile(join(root, '.owner'), 'utf8')) !== owner)
        throw new PythonProfileFailure(
            'harness_error',
            'Python profile ownership mismatch',
        );
    const profile = {
        userData: join(root, 'user-data'),
        extensions: join(root, 'extensions'),
        state: join(root, 'state'),
    };
    for (const path of Object.values(profile)) {
        if (created) await mkdir(path);
        await owned(path, true);
    }
    try {
        await requireClosedProfile(profile);
    } catch {
        throw new PythonProfileFailure(
            'blocked',
            'Close the dedicated Python profile before testing; inspect stale locks deliberately',
        );
    }
    const user = join(profile.userData, 'User');
    if (created) await mkdir(user);
    await owned(user, true);
    const path = join(user, 'settings.json');
    let settings: Record<string, unknown> = {};
    if (!created) {
        await owned(path, false);
        settings = JSON.parse(await readFile(path, 'utf8'));
    }
    if (!settings || Array.isArray(settings) || typeof settings !== 'object')
        throw new PythonProfileFailure(
            'harness_error',
            'Invalid Python profile settings',
        );
    settings = {
        ...settings,
        ...commonSettings,
        'chat.disableAIFeatures': true,
        ...pythonSettings(resources),
    };
    for (const key of [
        'chat.allowAnonymousAccess',
        'github.copilot.advanced.debug.overrideProxyUrl',
        'github.copilot.advanced.debug.overrideCapiUrl',
        'github.copilot.advanced.debug.overrideAuthType',
    ])
        delete settings[key];
    // Never follow links into another profile, database, or authentication state.
    for (const [item, directory] of [
        [join(user, 'globalStorage'), true],
        [join(user, 'globalStorage/state.vscdb'), false],
        [join(user, 'globalStorage/state.vscdb-wal'), false],
        [join(user, 'globalStorage/state.vscdb-shm'), false],
        [join(profile.state, '.copilot'), true],
        [join(profile.state, '.codex'), true],
    ] as const) {
        try {
            await lstat(item);
        } catch (cause) {
            if ((cause as NodeJS.ErrnoException).code === 'ENOENT') continue;
            throw cause;
        }
        await owned(item, directory);
    }
    // Refuse nested redirects before settings writes or VS Code can follow them.
    const pending = [root];
    while (pending.length) {
        const directory = pending.pop();
        if (!directory) break;
        for (const entry of await readdir(directory, { withFileTypes: true })) {
            if (entry.isSymbolicLink()) {
                throw new PythonProfileFailure(
                    'harness_error',
                    'Redirected Python profile state',
                );
            }
            if (entry.isDirectory()) pending.push(join(directory, entry.name));
        }
    }
    const temporary = join(user, 'settings.smoke-tmp.json');
    await writeFile(temporary, JSON.stringify(settings, null, 2), {
        flag: 'wx',
        mode: 0o600,
    });
    await rename(temporary, path);
    return profile;
}

export function pythonEnvironment(resources: string): Record<string, string> {
    return {
        PYTHONDONTWRITEBYTECODE: '1',
        PYTHONNOUSERSITE: '1',
        PIP_NO_INDEX: '1',
        PIP_DISABLE_PIP_VERSION_CHECK: '1',
        HOME: join(resources, 'home'),
        TMPDIR: join(resources, 'tmp'),
    };
}

export function pythonSettings(resources: string): Record<string, unknown> {
    const env = pythonEnvironment(resources);
    return {
        'python.createEnvironment.trigger': 'off',
        'python.createEnvironment.contentButton': 'hide',
        'python.experiments.enabled': false,
        'python.globalModuleInstallation': false,
        'python.terminal.activateEnvironment': false,
        'python.terminal.useEnvFile': false,
        'python-envs.terminal.autoActivationType': 'off',
        'editor.fontSize': 10,
        'editor.lineHeight': 12,
        'editor.wordWrap': 'off',
        'editor.minimap.enabled': false,
        'editor.autoIndent': 'none',
        'editor.formatOnType': false,
        'editor.autoClosingBrackets': 'never',
        'editor.autoClosingQuotes': 'never',
        'editor.quickSuggestions': false,
        'editor.suggestOnTriggerCharacters': false,
        'extensions.autoUpdate': 'off',
        'terminal.integrated.profiles.osx': {
            'Guard verification': {
                path: process.execPath,
                args: [join(resources, 'terminal-guard.cjs')],
                env,
            },
            'Python smoke': {
                path: '/bin/bash',
                args: ['--noprofile', '--norc'],
                env,
            },
        },
        'terminal.integrated.defaultProfile.osx': 'Python smoke',
        'terminal.integrated.env.osx': env,
        'terminal.integrated.inheritEnv': false,
        'terminal.integrated.shellIntegration.enabled': false,
        'terminal.integrated.enablePersistentSessions': false,
        'terminal.integrated.tabs.enabled': true,
    };
}
