import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseGUIArguments } from '../src/gui-arguments.js';

test('aggregate arguments preserve spaces and original npm invocation directory', () => {
    assert.deepEqual(
        parseGUIArguments(
            [
                '--build',
                '/Applications/Visual Studio Code.app',
                '--python-interpreter',
                'alias with spaces/bin/python',
            ],
            { cwd: '/repo/smoke', initCwd: '/original' },
        ),
        {
            buildPath: '/Applications/Visual Studio Code.app',
            pythonInterpreter: '/original/alias with spaces/bin/python',
            invocationCwd: '/original',
        },
    );
});

test('direct Node fallback uses cwd without canonicalizing interpreter spelling', () => {
    assert.equal(
        parseGUIArguments(
            ['--build', '/a.app', '--python-interpreter', 'link/python'],
            { cwd: '/direct' },
        ).pythonInterpreter,
        '/direct/link/python',
    );
    assert.equal(
        parseGUIArguments(
            [
                '--build',
                '/a.app',
                '--python-interpreter',
                '/space alias/python',
            ],
            { cwd: '/direct' },
        ).pythonInterpreter,
        '/space alias/python',
    );
});

test('aggregate rejects missing, duplicate, unknown and unsupported options', () => {
    for (const args of [
        [],
        ['--build', '/a.app'],
        ['--build', 'relative.app', '--python-interpreter', 'python'],
        ['--build', '/a', '--python-interpreter', 'python'],
        ['--build', '/a.app', '--python-interpreter'],
        [
            '--build',
            '/a.app',
            '--python-interpreter',
            'python',
            '--suite',
            'git',
        ],
        [
            '--build',
            '/a.app',
            '--python-interpreter',
            'python',
            '--chat-backend',
            'mock',
        ],
        [
            '--build',
            '/a.app',
            '--build',
            '/b.app',
            '--python-interpreter',
            'python',
        ],
        [
            '--build',
            '/a.app',
            '--python-interpreter',
            'python',
            '--python-interpreter',
            'other',
        ],
    ]) {
        assert.throws(() => parseGUIArguments(args));
    }
});
