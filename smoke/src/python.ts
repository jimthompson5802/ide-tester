import { CancellationError, ScenarioStoppedError } from './cancellation.js';
import { randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { requireAbsent, verifySavedFile } from './files.js';
import {
    createPythonProgram,
    verifyPythonExecution,
    type PythonIdentity,
} from './python-evidence.js';
import { PythonDeadline } from './workbench.js';

export interface PythonWorkbenchContract {
    ensurePythonExtension(): Promise<{
        installed: true;
        enabled: true;
        header: string;
    }>;
    newTextFile(): Promise<void>;
    replaceEditorText(text: string): Promise<void>;
    saveAs(path: string): Promise<void>;
    closeEditors(): Promise<void>;
    openFile(path: string): Promise<void>;
    expectEditorText(text: string): Promise<string[]>;
    selectPythonInterpreter(path: string): Promise<string>;
    pythonTerminalBaseline(): Promise<string[]>;
    pythonTerminalCount(): Promise<number>;
    runPythonFile(): Promise<void>;
    readPythonTerminal(): Promise<string[]>;
}
export interface PythonEvidence {
    token: string;
    stage: string;
    completedStages: string[];
    stageTimings: Record<string, number>;
    installMode?: 'fresh' | 'reused';
    extension?: { installed: true; enabled: true; header: string };
    extensions?: {
        id: string;
        version: string;
        extensionDependencies?: unknown;
        extensionPack?: unknown;
    }[];
    savedFile?: Awaited<ReturnType<typeof verifySavedFile>>;
    reopenedLines?: string[];
    enteredInterpreterPath?: string;
    baseline?: string[];
    terminal?: string[];
    terminalsBeforeRun?: number;
    terminalsAfterRun?: number;
    identity?: PythonIdentity;
    programJson?: string;
    interpreter?: { supplied: string; absolute: string; canonical: string };
    protectedPaths?: string[];
    applicationExit?: unknown;
    preservation?: { unchanged: boolean; entries: number };
}
export class PythonFailure extends Error {
    constructor(
        public readonly outcome: 'blocked' | 'failed' | 'harness_error',
        message: string,
        public evidence?: PythonEvidence,
    ) {
        super(message);
    }
}
export function pythonUiIssue(
    stage: 'installation' | 'interpreter',
    messages: string[],
): PythonFailure | undefined {
    const text = messages.join('\n');
    if (
        stage === 'interpreter' &&
        /(?:python interpreter|selected interpreter)[^\n]*(?:invalid|not found|unusable|does not exist)|(?:invalid|unusable) python interpreter/i.test(
            text,
        )
    )
        return new PythonFailure(
            'blocked',
            'The supplied Python interpreter is unavailable or unusable in the extension UI',
        );
    if (
        stage === 'installation' &&
        /ENOTFOUND|EAI_AGAIN|ECONNREFUSED|network (?:is )?(?:unavailable|offline)|failed to fetch.*Marketplace|(?:installing extensions|extension installation)[^\n]*(?:disabled|blocked).*policy/i.test(
            text,
        )
    )
        return new PythonFailure(
            'blocked',
            'Python extension Marketplace connectivity or policy prerequisite unavailable',
        );
    if (
        stage === 'installation' &&
        /(?:failed|unable) to (?:install|enable)[^\n]*(?:python|ms-python)|(?:python|ms-python)[^\n]*(?:installation|enablement) failed/i.test(
            text,
        )
    )
        return new PythonFailure(
            'failed',
            'Python extension installation or enablement reported an error',
        );
    return undefined;
}
export function newPythonEvidence(): PythonEvidence {
    return {
        token: randomUUID().replaceAll('-', '').slice(0, 12),
        stage: 'prepare',
        completedStages: [],
        stageTimings: {},
    };
}
async function installedExtensions(
    root: string,
    validateSuppression = false,
): Promise<NonNullable<PythonEvidence['extensions']>> {
    const properties = new Set<string>();
    const result: NonNullable<PythonEvidence['extensions']> = [];
    let obsolete: unknown = {};
    try {
        obsolete = JSON.parse(await readFile(join(root, '.obsolete'), 'utf8'));
    } catch (cause) {
        if (!(
            cause instanceof Error &&
            'code' in cause &&
            cause.code === 'ENOENT'
        ))
            throw cause;
    }
    if (!obsolete || typeof obsolete !== 'object' || Array.isArray(obsolete))
        throw new PythonFailure(
            'harness_error',
            'Invalid obsolete extension metadata',
        );
    for (const entry of await readdir(root, { withFileTypes: true })) {
        const name = entry.name;
        if (
            !entry.isDirectory() ||
            name.startsWith('.') ||
            (name in obsolete &&
                obsolete[name as keyof typeof obsolete] === true)
        )
            continue;
        const manifest: unknown = JSON.parse(
            await readFile(join(root, name, 'package.json'), 'utf8'),
        );
        if (
            !manifest ||
            typeof manifest !== 'object' ||
            !('publisher' in manifest) ||
            typeof manifest.publisher !== 'string' ||
            !manifest.publisher ||
            !('name' in manifest) ||
            typeof manifest.name !== 'string' ||
            !('version' in manifest) ||
            typeof manifest.version !== 'string'
        )
            throw new PythonFailure(
                'harness_error',
                'Invalid installed Python extension manifest',
            );
        if (
            manifest.publisher === 'ms-python' &&
            'contributes' in manifest &&
            manifest.contributes &&
            typeof manifest.contributes === 'object' &&
            'configuration' in manifest.contributes
        ) {
            const config = manifest.contributes.configuration;
            for (const item of Array.isArray(config) ? config : [config]) {
                if (
                    item &&
                    typeof item === 'object' &&
                    'properties' in item &&
                    item.properties &&
                    typeof item.properties === 'object'
                )
                    for (const key of Object.keys(item.properties))
                        properties.add(key);
            }
        }
        result.push({
            id: `${manifest.publisher}.${manifest.name}`,
            version: manifest.version,
            ...('extensionDependencies' in manifest
                ? { extensionDependencies: manifest.extensionDependencies }
                : {}),
            ...('extensionPack' in manifest
                ? { extensionPack: manifest.extensionPack }
                : {}),
        });
    }
    if (validateSuppression) {
        const required = [
            'python.createEnvironment.trigger',
            'python.createEnvironment.contentButton',
            'python.experiments.enabled',
            'python.globalModuleInstallation',
            'python.terminal.activateEnvironment',
            'python.terminal.useEnvFile',
            'python-envs.terminal.autoActivationType',
        ];
        if (required.some((key) => !properties.has(key)))
            throw new PythonFailure(
                'harness_error',
                'Installed Python suppression schema unavailable',
            );
    }
    return result;
}
export async function checkPython(
    workbench: PythonWorkbenchContract,
    workspace: string,
    interpreter: { supplied: string; absolute: string; canonical: string },
    evidence = newPythonEvidence(),
    deadline = new PythonDeadline(480_000),
    extensionsRoot?: string,
): Promise<PythonEvidence> {
    const step = <T>(operation: () => Promise<T>): Promise<T> =>
        deadline.perform(operation);
    const stage = async (
        name: string,
        budget: number,
        action: () => Promise<void>,
    ): Promise<void> => {
        deadline.stage(name, budget);
        evidence.stage = name;
        const start = Date.now();
        try {
            await step(action);
            evidence.completedStages.push(name);
        } finally {
            evidence.stageTimings[name] = Date.now() - start;
        }
    };
    evidence.interpreter = { ...interpreter };
    try {
        await stage('extension-install', 180_000, async () => {
            const before = extensionsRoot
                ? await step(() => installedExtensions(extensionsRoot))
                : [];
            evidence.installMode = before.some(
                (item) => item.id === 'ms-python.python',
            )
                ? 'reused'
                : 'fresh';
            evidence.extension = await step(() =>
                workbench.ensurePythonExtension(),
            );
            if (extensionsRoot) {
                evidence.extensions = await step(() =>
                    installedExtensions(extensionsRoot, true),
                );
                if (
                    evidence.extensions.filter(
                        (item) => item.id === 'ms-python.python',
                    ).length !== 1
                )
                    throw new PythonFailure(
                        'failed',
                        'Python extension installation did not produce exactly one installed version',
                    );
            }
        });
        const script = join(workspace, 'hello.py');
        const resultName = `python-evidence-${evidence.token}.json`;
        const source = createPythonProgram(
            evidence.token,
            join(workspace, resultName),
        );
        await stage('editor-save-reopen', 120_000, async () => {
            await step(() => requireAbsent(workspace, 'hello.py'));
            await step(() => requireAbsent(workspace, resultName));
            await step(() => workbench.newTextFile());
            await step(() => workbench.replaceEditorText(source));
            await step(() => workbench.saveAs(script));
            evidence.savedFile = await step(() =>
                verifySavedFile(workspace, 'hello.py', source),
            );
            await step(() => workbench.closeEditors());
            await step(() => workbench.openFile(script));
            evidence.reopenedLines = await step(() =>
                workbench.expectEditorText(source),
            );
            if (
                JSON.stringify(evidence.reopenedLines) !==
                JSON.stringify(source.split('\n'))
            )
                throw new PythonFailure(
                    'failed',
                    'Reopened Python editor contents differ',
                );
            await step(() => verifySavedFile(workspace, 'hello.py', source));
        });
        await stage('interpreter-selection', 60_000, async () => {
            evidence.enteredInterpreterPath = await step(() =>
                workbench.selectPythonInterpreter(interpreter.absolute),
            );
            if (evidence.enteredInterpreterPath !== interpreter.absolute)
                throw new PythonFailure(
                    'failed',
                    'Python interpreter picker selected a different path',
                );
        });
        await stage('terminal-baseline', 60_000, async () => {
            evidence.baseline = await step(() =>
                workbench.pythonTerminalBaseline(),
            );
            if (
                evidence.baseline.some(
                    (line) =>
                        line.includes(evidence.token) ||
                        line.includes('PYTHON_SMOKE_') ||
                        line === 'Hello, world!',
                )
            )
                throw new PythonFailure(
                    'failed',
                    'Stale Python terminal baseline',
                );
            evidence.terminalsBeforeRun = await step(() =>
                workbench.pythonTerminalCount(),
            );
            await step(() => requireAbsent(workspace, resultName));
        });
        await stage('python-run', 60_000, async () => {
            await step(() => workbench.openFile(script));
            await step(() => workbench.runPythonFile());
            while (true) {
                evidence.terminal = await step(() =>
                    workbench.readPythonTerminal(),
                );
                if (
                    evidence.terminal.some((line) =>
                        /^\s*(?:Traceback \(most recent call last\):|[\w.]*(?:Error|Exception)(?::|$)|KeyboardInterrupt|SystemExit)/.test(
                            line,
                        ),
                    )
                )
                    throw new PythonFailure(
                        'failed',
                        'Observed Python execution error',
                    );
                if (
                    evidence.terminal.includes(
                        `PYTHON_SMOKE_COMPLETE ${evidence.token}`,
                    )
                ) {
                    const result = await step(() =>
                        verifyPythonExecution({
                            workspace,
                            source,
                            token: evidence.token,
                            canonicalInterpreter: interpreter.canonical,
                            terminal: evidence.terminal,
                            baseline: evidence.baseline,
                        }),
                    );
                    Object.assign(evidence, result);
                    break;
                }
                await step(async () => {
                    await new Promise<void>((resolve) =>
                        setTimeout(resolve, 100),
                    );
                });
            }
            evidence.terminalsAfterRun = await step(() =>
                workbench.pythonTerminalCount(),
            );
        });
        deadline.remaining();
        evidence.stage = 'complete';
        return evidence;
    } catch (cause) {
        if (
            cause instanceof CancellationError ||
            cause instanceof ScenarioStoppedError
        )
            throw cause;
        const stage = evidence.stage;
        const functional =
            deadline.expired ||
            stage === 'editor-save-reopen' ||
            stage === 'python-run';
        const failure =
            cause instanceof PythonFailure
                ? cause
                : new PythonFailure(
                      functional ? 'failed' : 'harness_error',
                      `Python ${stage}: ${cause instanceof Error ? cause.message : String(cause)}`,
                  );
        failure.evidence = evidence;
        throw failure;
    }
}
