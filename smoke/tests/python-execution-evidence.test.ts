import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    makePythonSource,
    verifyPythonEvidence,
} from '../gui/python-execution-evidence.js';

const expected = {
    token: 'fresh0123456',
    script: '/private/tmp/owned/hello.py',
    canonicalInterpreter: '/opt/homebrew/bin/python3.12',
};
const identity = {
    schema: 1,
    token: expected.token,
    script: expected.script,
    executable: expected.canonicalInterpreter,
    invocation: '/checkout/.venv/bin/python',
    prefix: '/checkout/.venv',
    version: '3.12.15',
    pid: 1234,
    ppid: 123,
};

function evidence(value: unknown = identity): {
    raw: string;
    lines: string[];
} {
    const raw = JSON.stringify(value);
    return {
        raw,
        lines: [
            'Hello, world!',
            `PYTHON_SMOKE_IDENTITY ${raw}`,
            `PYTHON_SMOKE_COMPLETE ${expected.token}`,
        ],
    };
}

test('combined Python evidence binds complete terminal output to current program identity', () => {
    const { raw, lines } = evidence();
    assert.deepEqual(
        verifyPythonEvidence(
            ['shell prompt', ...lines, 'shell prompt'],
            raw,
            expected,
        ),
        identity,
    );
});

test('combined Python evidence reconstructs arbitrarily wrapped physical identity lines', () => {
    const { raw, lines } = evidence();
    const printed = lines[1];
    for (let width = 1; width < printed.length; width++) {
        const wrapped = Array.from(
            { length: Math.ceil(printed.length / width) },
            (_, index) =>
                printed.slice(index * width, (index + 1) * width).trimEnd(),
        );
        // Prefix wrapping is unsupported at widths smaller than the literal marker.
        if (width <= 'PYTHON_SMOKE_IDENTITY'.length) continue;
        assert.deepEqual(
            verifyPythonEvidence(
                [lines[0], ...wrapped, lines[2]],
                raw,
                expected,
            ),
            identity,
        );
    }
});

test('wrapped identity preserves paths containing spaces through ASCII JSON escapes', () => {
    const spaced = {
        ...identity,
        script: '/private/tmp/owned workspace/hello.py',
    };
    const raw = JSON.stringify(spaced).replaceAll(' ', '\\u0020');
    const printed = `PYTHON_SMOKE_IDENTITY ${raw}`;
    const width = 79;
    const wrapped = Array.from(
        { length: Math.ceil(printed.length / width) },
        (_, index) =>
            printed.slice(index * width, (index + 1) * width).trimEnd(),
    );
    assert.deepEqual(
        verifyPythonEvidence(
            [
                'Hello, world!',
                ...wrapped,
                `PYTHON_SMOKE_COMPLETE ${expected.token}`,
            ],
            raw,
            { ...expected, script: spaced.script },
        ),
        spaced,
    );
});

test('combined Python evidence rejects stale, partial, echoed, reordered and duplicate terminal output', () => {
    const { raw, lines } = evidence();
    for (const invalid of [
        [],
        lines.slice(0, 2),
        lines.map((line) => line.replace(expected.token, 'stale0123456')),
        lines.map((line) => `echo '${line}'`),
        [...lines].reverse(),
        [...lines, lines[2]],
        [...lines, lines[1]],
        [lines[0], lines[1].slice(0, -1), lines[2]],
        [lines[0], lines[1].replace('3.12.15', '3.12.14'), lines[2]],
        [lines[0], `${lines[1]}x`, lines[2]],
    ]) {
        assert.throws(() => verifyPythonEvidence(invalid, raw, expected));
    }
});

test('combined Python evidence rejects observed Python errors even with complete matching markers', () => {
    const { raw, lines } = evidence();
    for (const error of [
        'Traceback (most recent call last):',
        '  Traceback (most recent call last):',
        'ValueError: failed',
        'ModuleNotFoundError: missing module',
        'custom.package.CustomException: failed',
        'Error: failed',
        'Exception: failed',
        'ExceptionGroup: multiple failures',
        'KeyboardInterrupt',
        'SystemExit: 1',
    ]) {
        for (const observed of [
            [error, ...lines],
            [...lines, error],
        ]) {
            assert.throws(
                () => verifyPythonEvidence(observed, raw, expected),
                /Observed Python execution error/,
            );
        }
    }
    assert.doesNotThrow(() =>
        verifyPythonEvidence(
            [
                "/checkout/.venv/bin/python '/private/tmp/Error:/hello.py'",
                ...lines,
            ],
            raw,
            expected,
        ),
    );
});

test('combined Python evidence rejects wrong canonical interpreter, script and invalid identity', () => {
    for (const replacement of [
        { schema: 2 },
        { token: 'stale' },
        { script: '/other/hello.py' },
        { executable: '/other/python' },
        { pid: 0 },
        { pid: 1.5 },
        { ppid: -1 },
        { version: '' },
        { invocation: '' },
    ]) {
        const { raw, lines } = evidence({ ...identity, ...replacement });
        assert.throws(() => verifyPythonEvidence(lines, raw, expected));
    }
    const { raw, lines } = evidence();
    for (const invalid of [undefined, null, {}, '[]', '{', 'x'.repeat(8193)]) {
        assert.throws(() => verifyPythonEvidence(lines, invalid, expected));
    }
    assert.throws(() => verifyPythonEvidence(null, raw, expected));
    assert.throws(() => verifyPythonEvidence([1], raw, expected));
    assert.throws(() =>
        verifyPythonEvidence(['x'.repeat(262145)], raw, expected),
    );
});

test('Python source uses exclusive program-owned JSON creation and exact markers', () => {
    const source = makePythonSource(
        expected.token,
        `/private/tmp/owned/result-${expected.token}.json`,
    );
    assert.match(source, /open\(temporary_path, "x", encoding="utf-8"\)/);
    assert.match(source, /os\.replace\(temporary_path, result_path\)/);
    assert.match(source, /os\.path\.dirname\(os\.path\.realpath\(__file__\)\)/);
    assert.throws(() =>
        makePythonSource(expected.token, '/private/tmp/unbound.json'),
    );
    assert.match(source, /os\.path\.realpath\(sys\.executable\)/);
    assert.match(source, /os\.path\.realpath\(__file__\)/);
    assert.match(source, /"Hello, world!"/);
    assert.match(source, /"PYTHON_SMOKE_IDENTITY "/);
    assert.match(source, /"PYTHON_SMOKE_COMPLETE "/);
    assert.ok(source.endsWith('\n'));
    assert.throws(() =>
        makePythonSource('bad\ntoken', '/private/tmp/result.json'),
    );
    assert.throws(() =>
        makePythonSource('x'.repeat(25), '/private/tmp/result.json'),
    );
    assert.throws(() => makePythonSource('valid', 'relative-result.json'));
});
