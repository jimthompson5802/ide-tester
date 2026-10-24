import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import {
    mkdtemp,
    rm,
    writeFile,
    readFile,
    symlink,
    rename,
    mkdir,
    chmod,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createRun, finishRun } from '../src/resources.js';
import {
    prepareGit,
    gitCommand,
    gitEnvironment,
} from '../src/git-repository.js';

async function fixture(t: TestContext) {
    const root = await mkdtemp(join(tmpdir(), 'git-repository-test-'));
    t.after(() => rm(root, { recursive: true, force: true }));
    const run = await createRun(root);
    t.after(() => rm(run.resources, { recursive: true, force: true }));
    t.after(() => finishRun(run, false, []));
    return run;
}
const content = 'Known café ✓\n';
const message = 'Smoke repository verification 12345';

test('owned UI-initialized repository yields independently verified root commit and blob', async (t) => {
    const run = await fixture(t);
    const repository = await prepareGit(run);
    const git = async (...args: string[]) =>
        (
            await promisify(execFile)('/usr/bin/git', args, {
                cwd: run.workspace,
                env: repository.env,
                timeout: 5000,
            })
        ).stdout;
    await repository.requireUninitialized();
    await git('init'); // fixture simulates UI; production must never initialize through CLI
    const hook = join(run.workspace, '.git/hooks/pre-commit');
    await writeFile(hook, '#!/bin/sh\nexit 99\n');
    await chmod(hook, 0o700);
    await repository.configure();
    assert.equal(
        (await git('config', '--local', 'commit.gpgsign')).trim(),
        'false',
    );
    assert.equal(
        (await git('config', '--local', 'credential.helper')).trim(),
        '',
    );
    await writeFile(join(run.workspace, 'git-smoke.txt'), content);
    await git('add', '--', 'git-smoke.txt');
    await repository.requireStaged();
    await git('commit', '-m', message);
    const evidence = await repository.verify(message, content);
    assert.match(evidence.hash, /^[a-f0-9]{40}$/);
    assert.equal(evidence.message, message);
    assert.deepEqual(evidence.trackedPaths, ['git-smoke.txt']);
    assert.equal(evidence.author, 'Smoke Test <smoke-test@example.invalid>');
    assert.match(evidence.log, /Smoke repository verification 12345/);
    assert.equal(
        await readFile(join(run.workspace, 'existing.txt'), 'utf8'),
        'Initial smoke fixture\n',
    );
});

test('an unborn repository cannot produce commit verification success and is a functional failure', async (t) => {
    const run = await fixture(t);
    const repository = await prepareGit(run);
    await promisify(execFile)('/usr/bin/git', ['init'], {
        cwd: run.workspace,
        env: repository.env,
    });
    await repository.configure();
    await assert.rejects(
        repository.verify(message, content),
        (e: any) => e.outcome === 'failed',
    );
});

test('wrong message, blob, tracked paths, extra commits and unexpected staged paths prevent a pass', async (t) => {
    const run = await fixture(t);
    const repository = await prepareGit(run);
    const git = async (...args: string[]) =>
        (
            await promisify(execFile)('/usr/bin/git', args, {
                cwd: run.workspace,
                env: repository.env,
            })
        ).stdout;
    await git('init');
    await repository.configure();
    await writeFile(join(run.workspace, 'git-smoke.txt'), content);
    await git('add', 'git-smoke.txt');
    await git('commit', '-m', message);
    await assert.rejects(
        repository.configure(),
        (e: any) => e.outcome === 'failed',
    );
    await assert.rejects(
        repository.verify('wrong message', content),
        (e: any) => e.outcome === 'failed',
    );
    await assert.rejects(
        repository.verify(message, 'wrong bytes'),
        (e: any) => e.outcome === 'failed',
    );
    await git('add', 'existing.txt');
    await assert.rejects(
        repository.requireStaged(),
        (e: any) => e.outcome === 'failed',
    );
    await git('commit', '--amend', '--no-edit');
    await assert.rejects(
        repository.verify(message, content),
        (e: any) => e.outcome === 'failed',
    );
    await git('commit', '--allow-empty', '-m', message);
    await assert.rejects(
        repository.verify(message, content),
        (e: any) => e.outcome === 'failed',
    );
});

test('repository and config redirects are refused before local configuration writes', async (t) => {
    const run = await fixture(t);
    const repository = await prepareGit(run);
    await promisify(execFile)('/usr/bin/git', ['init'], {
        cwd: run.workspace,
        env: repository.env,
    });
    await rename(
        join(run.workspace, '.git'),
        join(run.resources, 'redirected-git'),
    );
    await symlink(
        join(run.resources, 'redirected-git'),
        join(run.workspace, '.git'),
    );
    await assert.rejects(repository.configure(), /ownership/);
    await rm(join(run.workspace, '.git'));
    await rename(
        join(run.resources, 'redirected-git'),
        join(run.workspace, '.git'),
    );
    const config = join(run.workspace, '.git/config');
    const original = await readFile(config, 'utf8');
    await rename(config, join(run.resources, 'outside-config'));
    await symlink(join(run.resources, 'outside-config'), config);
    await assert.rejects(repository.configure(), /ownership/);
    assert.equal(
        await readFile(join(run.resources, 'outside-config'), 'utf8'),
        original,
    );
    await rm(config);
    await writeFile(config, original);
    await writeFile(join(run.workspace, '.git/commondir'), '../outside');
    await assert.rejects(repository.configure(), /common directory/);
});

test('preflight refuses enclosing repositories, missing tools and incorrect ownership', async (t) => {
    const run = await fixture(t);
    const repository = await prepareGit(run);
    await promisify(execFile)('/usr/bin/git', ['init'], {
        cwd: run.resources,
        env: repository.env,
    });
    await assert.rejects(repository.requireUninitialized(), /enclosing/);
    await assert.rejects(prepareGit({ ...run, id: 'unowned' }), /ownership/);
    const other = await fixture(t);
    await assert.rejects(
        prepareGit(other, join(other.resources, 'missing-git')),
        (e: any) => e.outcome === 'blocked',
    );
});

test('external Git and secret environment overrides cannot redirect verifier configuration', async (t) => {
    const env = gitEnvironment({
        HOME: '/normal',
        GIT_DIR: '/private',
        GIT_CONFIG_COUNT: '1',
        GIT_AUTHOR_NAME: 'private',
        GIT_CONFIG_GLOBAL: '/private',
        GITHUB_PAT: 'private',
        HTTP_PROXY: 'private',
        PATH: '/usr/bin',
    });
    assert.deepEqual(env, { HOME: '/normal', PATH: '/usr/bin' });
    const run = await fixture(t);
    const old = process.env.GIT_DIR;
    process.env.GIT_DIR = '/must-not-exist';
    t.after(() => {
        if (old === undefined) delete process.env.GIT_DIR;
        else process.env.GIT_DIR = old;
    });
    const repository = await prepareGit(run);
    await repository.requireUninitialized();
    assert.equal(repository.env.GIT_CONFIG_NOSYSTEM, '1');
    assert.equal(await readFile(repository.env.GIT_CONFIG_GLOBAL, 'utf8'), '');
});

test('bounded child execution terminates timeouts and sanitizes exit diagnostics', async (t) => {
    const run = await fixture(t);
    const pidFile = join(run.resources, 'pid');
    await assert.rejects(
        gitCommand(
            process.execPath,
            [
                '-e',
                `require('fs').writeFileSync(process.argv[1],String(process.pid));setInterval(()=>{},1000)`,
                pidFile,
            ],
            run.workspace,
            {},
            500,
        ),
        /timed out.*terminated/,
    );
    const pid = Number(await readFile(pidFile, 'utf8'));
    assert.throws(
        () => process.kill(pid, 0),
        (e: any) => e.code === 'ESRCH',
    );
    await assert.rejects(
        gitCommand(
            process.execPath,
            ['-e', "process.stderr.write('SECRET');process.exit(3)"],
            run.workspace,
            {},
        ),
        (e: any) =>
            e.outcome === 'harness_error' && !String(e).includes('SECRET'),
    );
});

test('extension executable verification requires fresh owned log evidence and rejects mismatched Git', async (t) => {
    const { requireGitExtension, gitExtensionLogs } =
        await import('../src/git-repository.js');
    const run = await fixture(t);
    const repository = await prepareGit(run);
    const userData = run.userData;
    const oldDir = join(userData, 'logs/old/window1/exthost/vscode.git');
    await mkdir(oldDir, { recursive: true });
    await writeFile(
        join(oldDir, 'Git.log'),
        `Using git "${repository.version.replace('git version ', '')}" from "/usr/bin/git"\n`,
    );
    const previous = await gitExtensionLogs(userData);
    await assert.rejects(
        requireGitExtension(userData, repository, previous, 10),
        (e: any) => e.outcome === 'harness_error',
    );
    const dir = join(userData, 'logs/new/window1/exthost/vscode.git');
    await mkdir(dir, { recursive: true });
    await writeFile(
        join(dir, 'Git.log'),
        'Using git "unexpected-version" from "/unapproved/git"\n',
    );
    await assert.rejects(
        requireGitExtension(userData, repository, previous, 10),
        (e: any) => e.outcome === 'blocked',
    );
    await writeFile(
        join(dir, 'Git.log'),
        `Using git "${repository.version.replace('git version ', '')}" from "/usr/bin/git"\n`,
    );
    await requireGitExtension(userData, repository, previous, 10);
});

test('a commit with no expected blob is a functional mismatch, not a subprocess infrastructure fault', async (t) => {
    const run = await fixture(t);
    const repository = await prepareGit(run);
    const git = async (...args: string[]) =>
        promisify(execFile)('/usr/bin/git', args, {
            cwd: run.workspace,
            env: repository.env,
        });
    await git('init');
    await repository.configure();
    await git('add', 'existing.txt');
    await git('commit', '-m', message);
    await assert.rejects(
        repository.verify(message, content),
        (e: any) => e.outcome === 'failed',
    );
});
