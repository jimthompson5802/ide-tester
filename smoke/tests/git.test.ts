import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { createRun, finishRun } from '../src/resources.js';
import { prepareGit } from '../src/git-repository.js';
import { checkGit, newGitEvidence } from '../src/git.js';

async function scenario(t: TestContext, graphMatches = true) {
    const root = await mkdtemp(join(tmpdir(), 'git-scenario-'));
    t.after(() => rm(root, { recursive: true, force: true }));
    const run = await createRun(root);
    t.after(() => rm(run.resources, { recursive: true, force: true }));
    t.after(() => finishRun(run, false, []));
    const repository = await prepareGit(run);
    const events: string[] = [];
    let text = '';
    const git = async (...args: string[]) =>
        (
            await promisify(execFile)('/usr/bin/git', args, {
                cwd: run.workspace,
                env: repository.env,
            })
        ).stdout;
    const workbench = {
        async initializeGit(path: string) {
            assert.equal(path, run.workspace);
            events.push('init');
            await git('init');
        },
        async newTextFile() {
            assert.equal(
                (await git('config', '--local', 'user.name')).trim(),
                'Smoke Test',
            );
            events.push('new');
        },
        async replaceEditorText(value: string) {
            text = value;
            events.push('type');
        },
        async saveAs(path: string) {
            events.push('save');
            await writeFile(path, text);
        },
        async stageGitFile() {
            events.push('stage');
            await git('add', '--', 'git-smoke.txt');
        },
        async commitGit(message: string) {
            events.push('commit');
            await git('commit', '-m', message);
        },
        async showGitGraph(message: string) {
            events.push('graph');
            return graphMatches ? message : 'wrong message';
        },
        async closeEditors() {
            events.push('close');
        },
    };
    return { run, repository, workbench, events };
}

test('Git journey uses init/editor/target staging/commit/Graph and verifies exact root commit without a UI hash', async (t) => {
    const { run, repository, workbench, events } = await scenario(t);
    const evidence = await checkGit(
        workbench,
        repository,
        run.workspace,
        newGitEvidence(),
    );
    assert.deepEqual(events, [
        'init',
        'new',
        'type',
        'save',
        'stage',
        'commit',
        'graph',
        'close',
    ]);
    assert.equal(evidence.graphMessage, evidence.expectedMessage);
    assert.equal(evidence.graphVisible, true);
    assert.match(evidence.hash!, /^[a-f0-9]{40}$/);
    assert.equal(evidence.initialized, true);
});

test('a missing Graph match prevents a pass while preserving independent commit evidence', async (t) => {
    const { run, repository, workbench } = await scenario(t, false);
    const evidence = newGitEvidence();
    await assert.rejects(
        checkGit(workbench, repository, run.workspace, evidence),
        (e: any) => e.outcome === 'failed' && e.evidence === evidence,
    );
    assert.equal(evidence.stage, 'graph');
    assert.equal(evidence.graphVisible, false);
    assert.match(evidence.hash!, /^[a-f0-9]{40}$/);
});

test('missing Graph UI contract remains a harness error and preserves earlier stages', async (t) => {
    const { GitFailure } = await import('../src/git.js');
    const { run, repository, workbench } = await scenario(t);
    workbench.showGitGraph = async () => {
        throw new GitFailure('harness_error', 'Graph view unavailable');
    };
    await assert.rejects(
        checkGit(workbench, repository, run.workspace),
        (e: any) =>
            e.outcome === 'harness_error' &&
            e.evidence.completedStages.includes('commit'),
    );
});

test('wrong saved bytes stop before staging and a wrong independently committed message stops before Graph', async (t) => {
    const first = await scenario(t);
    first.workbench.saveAs = async (path) => {
        await writeFile(path, 'wrong bytes');
    };
    await assert.rejects(
        checkGit(first.workbench, first.repository, first.run.workspace),
        (e: any) =>
            e.outcome === 'failed' && e.evidence.stage === 'editor-save',
    );
    assert.ok(!first.events.includes('stage'));
    const second = await scenario(t);
    const commit = second.workbench.commitGit;
    second.workbench.commitGit = () => commit('wrong commit message');
    await assert.rejects(
        checkGit(second.workbench, second.repository, second.run.workspace),
        (e: any) =>
            e.outcome === 'failed' &&
            e.evidence.stage === 'independent-verification' &&
            /^[a-f0-9]{40}$/.test(e.evidence.hash),
    );
    assert.ok(!second.events.includes('graph'));
});

test('cancellation after Git initialization prevents repository configuration and later stages', async (t) => {
    const { Cancellation, CancellationError } =
        await import('../src/cancellation.js');
    const cancellation = new Cancellation();
    const { run, repository, workbench, events } = await scenario(t);
    const initialize = workbench.initializeGit;
    workbench.initializeGit = async (path) => {
        await initialize(path);
        cancellation.request();
    };
    let configured = false;
    repository.configure = async () => {
        configured = true;
    };
    await assert.rejects(
        checkGit(
            workbench,
            repository,
            run.workspace,
            newGitEvidence(),
            cancellation,
        ),
        CancellationError,
    );
    await cancellation.settle(1000);
    assert.equal(configured, false);
    assert.deepEqual(events, ['init']);
});
