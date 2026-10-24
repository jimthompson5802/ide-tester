import {
    Cancellation,
    CancellationError,
    ScenarioStoppedError,
} from './cancellation.js';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { requireAbsent, verifySavedFile } from './files.js';
import {
    GitFailure,
    type GitRepository,
    type GitEvidence,
} from './git-repository.js';
export { GitFailure, type GitEvidence } from './git-repository.js';

export const gitText =
    'Created through VS Code for Git smoke.\nLocal-only café ✓\n';
export function newGitEvidence(): GitEvidence {
    return {
        stage: 'preflight',
        completedStages: [],
        filename: 'git-smoke.txt',
        expectedMessage: `Smoke Git ${randomUUID()}`,
    };
}
export interface GitWorkbench {
    initializeGit(workspace: string): Promise<void>;
    newTextFile(): Promise<void>;
    replaceEditorText(text: string): Promise<void>;
    saveAs(path: string): Promise<void>;
    stageGitFile(): Promise<void>;
    commitGit(message: string): Promise<void>;
    showGitGraph(message: string): Promise<string>;
    closeEditors(): Promise<void>;
}
export async function checkGit(
    workbench: GitWorkbench,
    repository: GitRepository,
    workspace: string,
    evidence = newGitEvidence(),
    cancellation = new Cancellation(),
): Promise<GitEvidence> {
    const stage = async (name: string, action: () => Promise<void>) => {
        evidence.stage = name;
        await cancellation.perform(async () => action());
        evidence.completedStages.push(name);
    };
    try {
        evidence.version = repository.version;
        await cancellation.perform(async () =>
            stage('initialization', async () => {
                await cancellation.perform(async () =>
                    repository.requireUninitialized(),
                );
                await cancellation.perform(async () =>
                    workbench.initializeGit(workspace),
                );
                await cancellation.perform(async () => repository.configure());
                evidence.initialized = true;
            }),
        );
        await cancellation.perform(async () =>
            stage('editor-save', async () => {
                await cancellation.perform(async () =>
                    requireAbsent(workspace, evidence.filename),
                );
                await cancellation.perform(async () => workbench.newTextFile());
                await cancellation.perform(async () =>
                    workbench.replaceEditorText(gitText),
                );
                await cancellation.perform(async () =>
                    workbench.saveAs(join(workspace, evidence.filename)),
                );
                const saved = await cancellation.perform(async () =>
                    verifySavedFile(workspace, evidence.filename, gitText),
                );
                evidence.bytes = saved.bytes;
                evidence.sha256 = saved.sha256;
            }),
        );
        await cancellation.perform(async () =>
            stage('staging', async () => {
                await cancellation.perform(async () =>
                    workbench.stageGitFile(),
                );
                await cancellation.perform(async () =>
                    repository.requireStaged(),
                );
            }),
        );
        await cancellation.perform(async () =>
            stage('commit', async () => {
                await cancellation.perform(async () =>
                    workbench.commitGit(evidence.expectedMessage),
                );
            }),
        );
        await cancellation.perform(async () =>
            stage('independent-verification', async () => {
                Object.assign(
                    evidence,
                    await cancellation.perform(async () =>
                        repository.verify(
                            evidence.expectedMessage,
                            gitText,
                            evidence,
                        ),
                    ),
                );
            }),
        );
        await cancellation.perform(async () =>
            stage('graph', async () => {
                evidence.graphMessage = await cancellation.perform(async () =>
                    workbench.showGitGraph(evidence.expectedMessage),
                );
                evidence.graphVisible =
                    evidence.graphMessage === evidence.expectedMessage;
                if (!evidence.graphVisible)
                    throw new GitFailure(
                        'failed',
                        'Expected unique commit message missing from Source Control Graph',
                    );
            }),
        );
        await cancellation.perform(async () =>
            stage('close-editors', () => workbench.closeEditors()),
        );
        evidence.stage = 'complete';
        return evidence;
    } catch (cause) {
        if (
            cause instanceof CancellationError ||
            cause instanceof ScenarioStoppedError
        )
            throw cause;
        const failure =
            cause instanceof GitFailure
                ? cause
                : new GitFailure(
                      'failed',
                      `Git operation failed (${evidence.stage})`,
                  );
        failure.evidence = evidence;
        throw failure;
    }
}
