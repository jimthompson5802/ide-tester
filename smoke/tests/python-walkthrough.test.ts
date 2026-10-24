import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import {
    commandLabelPattern,
    parsePythonWalkthrough,
} from '../gui/python-walkthrough.js';

test('walkthrough command labels match exact titled or category-free rows only', () => {
    const pattern = commandLabelPattern(
        'Terminal: Create New Terminal (With Profile)',
    );
    assert.equal(pattern.test('Create New Terminal (With Profile)'), true);
    assert.equal(
        pattern.test('Terminal: Create New Terminal (With Profile)'),
        true,
    );
    assert.equal(
        pattern.test(
            'Terminal: Create New Terminal Starting in a Custom Working Directory',
        ),
        false,
    );
    assert.equal(pattern.test('Create New Terminal With Profile'), false);
});

test('Python walkthrough accepts only the explicit build and retained interpreter', () => {
    const args = [
        '--build',
        '/Applications/Visual Studio Code.app',
        '--python-interpreter',
        '/checkout/.venv/bin/python',
    ];
    assert.deepEqual(parsePythonWalkthrough(args), {
        build: args[1],
        interpreter: args[3],
    });
    for (const invalid of [
        [],
        args.slice(0, 2),
        [...args, '--extra'],
        ['--build', 'relative', ...args.slice(2)],
        [...args.slice(0, 3), 'python'],
    ])
        assert.throws(() => parsePythonWalkthrough(invalid));
});

test('Python probe dispatch settles and refuses an unauthorized interpreter before reserving or launching', async () => {
    await assert.rejects(
        promisify(execFile)(process.execPath, [
            fileURLToPath(
                new URL(
                    '../gui/issue-40-python-feasibility.js',
                    import.meta.url,
                ),
            ),
            '--build',
            '/unused.app',
            '--python-interpreter',
            '/unauthorized/python',
        ]),
        (error: unknown) =>
            error instanceof Error &&
            error.message.includes(
                'Only the authorized retained interpreter is supported',
            ),
    );
});
