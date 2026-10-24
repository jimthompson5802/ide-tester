import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, realpath, rm, writeFile, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
    createPythonProgram,
    verifyPythonExecution,
} from '../src/python-evidence.js';

test('production Python acceptance requires exact saved source, regular current JSON and complete matching terminal evidence', async (t) => {
    const workspace = await realpath(
        await mkdtemp(join(tmpdir(), 'python-evidence-')),
    );
    t.after(() => rm(workspace, { recursive: true, force: true }));
    const token = 'current123';
    const result = join(workspace, `python-evidence-${token}.json`);
    const source = createPythonProgram(token, result);
    const script = join(workspace, 'hello.py');
    const canonicalInterpreter = join(workspace, 'python');
    await writeFile(canonicalInterpreter, 'not executed');
    const alias = join(workspace, 'venv python');
    await symlink(canonicalInterpreter, alias);
    const identity = {
        schema: 1,
        token,
        script,
        executable: canonicalInterpreter,
        invocation: '/venv/bin/python',
        version: '3.12.15',
        pid: 100,
        ppid: 99,
    };
    const raw = JSON.stringify(identity);
    const terminal = [
        'Hello, world!',
        `PYTHON_SMOKE_IDENTITY ${raw}`,
        `PYTHON_SMOKE_COMPLETE ${token}`,
    ];
    const input = { workspace, token, source, canonicalInterpreter, terminal };
    await assert.rejects(verifyPythonExecution(input));
    await writeFile(script, source);
    await assert.rejects(verifyPythonExecution(input));
    await writeFile(result, raw);
    assert.deepEqual((await verifyPythonExecution(input)).identity, identity);
    assert.deepEqual(
        (await verifyPythonExecution({ ...input, canonicalInterpreter: alias }))
            .identity,
        identity,
    );
    const printed = terminal[1];
    const wrapped = Array.from(
        { length: Math.ceil(printed.length / 79) },
        (_, index) => printed.slice(index * 79, (index + 1) * 79),
    );
    assert.deepEqual(
        (
            await verifyPythonExecution({
                ...input,
                terminal: [terminal[0], ...wrapped, terminal[2]],
            })
        ).identity,
        identity,
    );
    for (const changed of [
        { terminal: [] },
        { terminal: terminal.slice(0, 1) },
        { terminal: terminal.map((line) => `echo '${line}'`) },
        { terminal: terminal.slice(0, 2) },
        { terminal: [...terminal].reverse() },
        { terminal: [...terminal, terminal[2]] },
        { terminal: ['x'.repeat(262145)] },
        { terminal: [...terminal, 'ValueError: observed'] },
        { canonicalInterpreter: '/wrong/python' },
        { exitCode: 1 },
        { baseline: terminal },
    ])
        await assert.rejects(verifyPythonExecution({ ...input, ...changed }));
    for (const rawInvalid of [
        '{',
        '{}',
        raw.replace(token, 'stale'),
        raw.replace('3.12.15', ''),
        raw.replace('"pid":100', '"pid":0'),
        raw.replace(script, '/wrong/hello.py'),
        'x'.repeat(8193),
    ]) {
        await writeFile(result, rawInvalid);
        await assert.rejects(verifyPythonExecution(input));
    }
    await writeFile(result, raw);
    await writeFile(script, 'changed');
    await assert.rejects(verifyPythonExecution(input));
    await writeFile(script, source);
    await rm(result);
    const external = join(workspace, 'external.json');
    await writeFile(external, raw);
    await symlink(external, result);
    await assert.rejects(verifyPythonExecution(input));
});
