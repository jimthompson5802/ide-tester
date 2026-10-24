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
): Promise<GitEvidence> {
    const stage = async (name: string, action: () => Promise<void>) => {
        evidence.stage = name;
        await action();
        evidence.completedStages.push(name);
    };
    try {
        evidence.version = repository.version;
        await stage('initialization', async () => {
            await repository.requireUninitialized();
            await workbench.initializeGit(workspace);
            await repository.configure();
            evidence.initialized = true;
        });
        await stage('editor-save', async () => {
            await requireAbsent(workspace, evidence.filename);
            await workbench.newTextFile();
            await workbench.replaceEditorText(gitText);
            await workbench.saveAs(join(workspace, evidence.filename));
            const saved = await verifySavedFile(
                workspace,
                evidence.filename,
                gitText,
            );
            evidence.bytes = saved.bytes;
            evidence.sha256 = saved.sha256;
        });
        await stage('staging', async () => {
            await workbench.stageGitFile();
            await repository.requireStaged();
        });
        await stage('commit', async () => {
            await workbench.commitGit(evidence.expectedMessage);
        });
        await stage('independent-verification', async () => {
            Object.assign(
                evidence,
                await repository.verify(
                    evidence.expectedMessage,
                    gitText,
                    evidence,
                ),
            );
        });
        await stage('graph', async () => {
            evidence.graphMessage = await workbench.showGitGraph(
                evidence.expectedMessage,
            );
            evidence.graphVisible =
                evidence.graphMessage === evidence.expectedMessage;
            if (!evidence.graphVisible)
                throw new GitFailure(
                    'failed',
                    'Expected unique commit message missing from Source Control Graph',
                );
        });
        await stage('close-editors', () => workbench.closeEditors());
        evidence.stage = 'complete';
        return evidence;
    } catch (cause) {
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
