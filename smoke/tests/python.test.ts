import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import type { Page } from '@playwright/test';
import { PythonDeadline, PythonWorkbench } from '../src/workbench.js';

for (const action of [
    'openFile',
    'replaceEditorText',
    'saveAs',
    'newTextFile',
    'closeEditors',
    'typeInEditor',
    'selectPythonInterpreter',
    'ensurePythonExtension',
] as const) {
    test(`production Python ${action} stops after its first pending UI action expires`, async () => {
        const deadline = new PythonDeadline(20);
        let release!: () => void;
        const pending = new Promise<void>((done) => {
            release = done;
        });
        let calls = 0;
        const invoke = async (): Promise<void> => {
            calls++;
            await pending;
        };
        const page = {
            keyboard: { press: invoke },
            locator: () => ({ focus: invoke, fill: invoke }),
            evaluate: invoke,
        };
        const workbench = new PythonWorkbench(
            page as unknown as Page,
            deadline,
        );
        const result =
            action === 'typeInEditor'
                ? workbench.typeInEditor('.editor', 'source')
                : action === 'newTextFile' ||
                    action === 'closeEditors' ||
                    action === 'ensurePythonExtension'
                  ? workbench[action]()
                  : workbench[action]('/owned/hello.py');
        await assert.rejects(result, /expired/);
        release();
        await deadline.settle(1000);
        assert.equal(calls, 1);
    });
}

import { mkdtemp, rm, writeFile, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
    checkPython,
    newPythonEvidence,
    PythonFailure,
    type PythonWorkbenchContract,
} from '../src/python.js';

async function scenario(t: TestContext) {
    const workspace = await realpath(
        await mkdtemp(join(tmpdir(), 'python-scenario-')),
    );
    t.after(() => rm(workspace, { recursive: true, force: true }));
    const events: string[] = [];
    let source = '';
    const evidence = newPythonEvidence();
    evidence.token = 'current_test';
    const raw = JSON.stringify({
        schema: 1,
        token: 'current_test',
        script: join(workspace, 'hello.py'),
        executable: process.execPath,
        invocation: '/fixture/venv/python',
        version: '3.12.15',
        pid: 321,
        ppid: 123,
    });
    const workbench: PythonWorkbenchContract = {
        async ensurePythonExtension() {
            events.push('install');
            return {
                installed: true,
                enabled: true,
                header: 'Microsoft Python',
            };
        },
        async newTextFile() {
            events.push('new');
        },
        async replaceEditorText(text) {
            source = text;
            events.push('type');
        },
        async saveAs(path) {
            events.push('save');
            await writeFile(path, source);
        },
        async closeEditors() {
            events.push('close');
        },
        async openFile() {
            events.push('open');
        },
        async expectEditorText(text) {
            events.push('reopen');
            return text.split('\n');
        },
        async selectPythonInterpreter(path) {
            events.push('select');
            return path;
        },
        async pythonTerminalBaseline() {
            events.push('baseline');
            return ['$ '];
        },
        async pythonTerminalCount() {
            return 1;
        },
        async runPythonFile() {
            events.push('run');
            await writeFile(
                join(workspace, 'python-evidence-current_test.json'),
                raw,
            );
        },
        async readPythonTerminal() {
            return [
                '$ ',
                'Hello, world!',
                `PYTHON_SMOKE_IDENTITY ${raw}`,
                'PYTHON_SMOKE_COMPLETE current_test',
            ];
        },
    };
    return { workspace, workbench, evidence, events };
}
const interpreter = {
    supplied: '/fixture/venv/python',
    absolute: '/fixture/venv/python',
    canonical: process.execPath,
};

test('production Python journey verifies editor source, picker, fresh terminal and program file together', async (t) => {
    const s = await scenario(t);
    const result = await checkPython(
        s.workbench,
        s.workspace,
        interpreter,
        s.evidence,
    );
    assert.equal(result.stage, 'complete');
    assert.equal(result.identity?.version, '3.12.15');
    assert.deepEqual(s.events, [
        'install',
        'new',
        'type',
        'save',
        'close',
        'open',
        'reopen',
        'select',
        'baseline',
        'open',
        'run',
    ]);
});

test('wrong saved source stops before interpreter selection and retains earlier installation evidence', async (t) => {
    const s = await scenario(t);
    s.workbench.saveAs = async (path) => {
        await writeFile(path, 'wrong');
    };
    await assert.rejects(
        checkPython(s.workbench, s.workspace, interpreter, s.evidence),
        (error: unknown) =>
            error instanceof PythonFailure &&
            error.outcome === 'failed' &&
            error.evidence === s.evidence,
    );
    assert.equal(s.evidence.stage, 'editor-save-reopen');
    assert.ok(!s.events.includes('select'));
    assert.equal(s.evidence.extension?.enabled, true);
});

for (const [stage, outcome] of [
    ['install', 'failed'],
    ['select', 'blocked'],
    ['terminal', 'harness_error'],
] as const) {
    test(`Python ${stage} failure keeps its classification and partial stage evidence`, async (t) => {
        const s = await scenario(t);
        const fail = async (): Promise<never> => {
            throw new PythonFailure(outcome, 'observed problem');
        };
        if (stage === 'install') s.workbench.ensurePythonExtension = fail;
        else if (stage === 'select') s.workbench.selectPythonInterpreter = fail;
        else s.workbench.readPythonTerminal = fail;
        await assert.rejects(
            checkPython(s.workbench, s.workspace, interpreter, s.evidence),
            (error: unknown) =>
                error instanceof PythonFailure &&
                error.outcome === outcome &&
                error.evidence === s.evidence,
        );
        assert.notEqual(s.evidence.stage, 'complete');
    });
}

test('wrong picker path cannot start Python execution', async (t) => {
    const s = await scenario(t);
    s.workbench.selectPythonInterpreter = async () => '/wrong/python';
    await assert.rejects(
        checkPython(s.workbench, s.workspace, interpreter, s.evidence),
        /different path/,
    );
    assert.ok(!s.events.includes('run'));
});

test('a traceback prevents acceptance even with otherwise complete execution evidence', async (t) => {
    const s = await scenario(t);
    const read = s.workbench.readPythonTerminal;
    s.workbench.readPythonTerminal = async () => [
        ...(await read()),
        'RuntimeError: failure',
    ];
    await assert.rejects(
        checkPython(s.workbench, s.workspace, interpreter, s.evidence),
        /Observed Python execution error/,
    );
});

test('scenario deadline rejects late installation and dispatches no editor actions', async (t) => {
    const s = await scenario(t);
    const deadline = new PythonDeadline(20);
    let release!: () => void;
    const pending = new Promise<void>((done) => {
        release = done;
    });
    s.workbench.ensurePythonExtension = async () => {
        await pending;
        return { installed: true, enabled: true, header: 'Microsoft Python' };
    };
    await assert.rejects(
        checkPython(
            s.workbench,
            s.workspace,
            interpreter,
            s.evidence,
            deadline,
        ),
        /expired/,
    );
    release();
    await deadline.settle(1000);
    assert.ok(!s.events.includes('new'));
    assert.equal(s.evidence.stage, 'extension-install');
});

import { mkdir } from 'node:fs/promises';
for (const reused of [false, true]) {
    test(`Python reports actual dependency versions for ${reused ? 'reused' : 'fresh'} installation`, async (t) => {
        const s = await scenario(t);
        const root = join(s.workspace, 'extensions');
        await mkdir(root);
        const install = async (): Promise<void> => {
            await mkdir(join(root, 'ms-python.python-1.2.3'), {
                recursive: true,
            });
            const properties = Object.fromEntries(
                [
                    'python.createEnvironment.trigger',
                    'python.createEnvironment.contentButton',
                    'python.experiments.enabled',
                    'python.globalModuleInstallation',
                    'python.terminal.activateEnvironment',
                    'python.terminal.useEnvFile',
                    'python-envs.terminal.autoActivationType',
                ].map((key) => [key, {}]),
            );
            await writeFile(
                join(root, 'ms-python.python-1.2.3/package.json'),
                JSON.stringify({
                    publisher: 'ms-python',
                    name: 'python',
                    version: '1.2.3',
                    extensionDependencies: ['ms-python.debugpy'],
                    contributes: { configuration: { properties } },
                }),
            );
        };
        await mkdir(join(root, 'external.dependency-2'), { recursive: true });
        await writeFile(
            join(root, 'external.dependency-2/package.json'),
            JSON.stringify({
                publisher: 'external',
                name: 'dependency',
                version: '2',
            }),
        );
        await mkdir(join(root, 'ms-python.python-obsolete'), {
            recursive: true,
        });
        await writeFile(
            join(root, '.obsolete'),
            JSON.stringify({ 'ms-python.python-obsolete': true }),
        );
        if (reused) await install();
        const ensure = s.workbench.ensurePythonExtension;
        s.workbench.ensurePythonExtension = async () => {
            await install();
            return ensure();
        };
        const result = await checkPython(
            s.workbench,
            s.workspace,
            interpreter,
            s.evidence,
            new PythonDeadline(1000),
            root,
        );
        assert.equal(result.installMode, reused ? 'reused' : 'fresh');
        assert.ok(
            result.extensions?.some(
                (item) =>
                    item.id === 'external.dependency' && item.version === '2',
            ),
        );
        assert.equal(result.extensions?.length, 2);
        assert.deepEqual(
            result.extensions?.find((item) => item.id === 'ms-python.python'),
            {
                id: 'ms-python.python',
                version: '1.2.3',
                extensionDependencies: ['ms-python.debugpy'],
            },
        );
    });
}

test('unsupported installed suppression schema stops before editor and interpreter work', async (t) => {
    const s = await scenario(t);
    const root = join(s.workspace, 'extensions');
    await mkdir(join(root, 'ms-python.python-1'), { recursive: true });
    await writeFile(
        join(root, 'ms-python.python-1/package.json'),
        JSON.stringify({
            publisher: 'ms-python',
            name: 'python',
            version: '1',
        }),
    );
    await assert.rejects(
        checkPython(
            s.workbench,
            s.workspace,
            interpreter,
            s.evidence,
            new PythonDeadline(1000),
            root,
        ),
        /suppression/,
    );
    assert.ok(!s.events.includes('new'));
});

import { pythonUiIssue } from '../src/python.js';
for (const [stage, message, outcome] of [
    [
        'interpreter',
        'The selected Python interpreter is invalid. Please try changing it.',
        'blocked',
    ],
    ['interpreter', 'Python interpreter not found at /test/python', 'blocked'],
    [
        'installation',
        'Error while installing Python extension: failed to fetch Marketplace (ENOTFOUND)',
        'blocked',
    ],
    ['installation', 'Installing extensions is disabled by policy', 'blocked'],
    [
        'installation',
        'Failed to install extension ms-python.python: archive is corrupt',
        'failed',
    ],
    ['installation', 'Failed to enable Python extension', 'failed'],
] as const) {
    test(`Python UI classifies observed ${message}`, () => {
        const issue = pythonUiIssue(stage, [message]);
        assert.ok(issue instanceof PythonFailure);
        assert.equal(issue.outcome, outcome);
    });
}
test('unknown notification and a plain installation timeout do not invent a prerequisite', () => {
    assert.equal(
        pythonUiIssue('installation', ['Installation timed out']),
        undefined,
    );
    assert.equal(
        pythonUiIssue('interpreter', ['Unexpected view changed']),
        undefined,
    );
});
