import { basename, isAbsolute } from 'node:path';

export interface PythonIdentity {
    schema: 1;
    token: string;
    script: string;
    executable: string;
    invocation: string;
    version: string;
    pid: number;
    ppid: number;
}

interface ExpectedPythonIdentity {
    token: string;
    script: string;
    canonicalInterpreter: string;
}

export function makePythonSource(token: string, resultPath: string): string {
    if (
        !/^[A-Za-z0-9_-]{1,24}$/.test(token) ||
        !isAbsolute(resultPath) ||
        !basename(resultPath).includes(token)
    )
        throw new Error('Invalid Python evidence fixture');
    return `import json
import os
import platform
import sys

token = ${JSON.stringify(token)}
result_path = os.path.join(os.path.dirname(os.path.realpath(__file__)), ${JSON.stringify(basename(resultPath))})
identity = {
    "schema": 1,
    "token": token,
    "script": os.path.realpath(__file__),
    "executable": os.path.realpath(sys.executable),
    "invocation": sys.executable,
    "prefix": os.path.realpath(sys.prefix),
    "version": platform.python_version(),
    "architecture": platform.machine(),
    "pid": os.getpid(),
    "ppid": os.getppid(),
}
# Escaped spaces preserve identity bytes across trimEnd physical-line reads.
raw = json.dumps(identity, ensure_ascii=True, separators=(",", ":")).replace(" ", "\\\\u0020")
if os.path.lexists(result_path):
    raise FileExistsError("Python execution evidence already exists")
temporary_path = result_path + ".tmp-" + str(os.getpid())
with open(temporary_path, "x", encoding="utf-8") as result:
    result.write(raw)
os.replace(temporary_path, result_path)
print("Hello, world!", flush=True)
print("PYTHON_SMOKE_IDENTITY " + raw, flush=True)
print("PYTHON_SMOKE_COMPLETE " + token, flush=True)
`;
}

function parseIdentity(raw: string): PythonIdentity {
    const value: unknown = JSON.parse(raw);
    if (
        !value ||
        typeof value !== 'object' ||
        !('schema' in value) ||
        value.schema !== 1 ||
        !('token' in value) ||
        typeof value.token !== 'string' ||
        !('script' in value) ||
        typeof value.script !== 'string' ||
        !isAbsolute(value.script) ||
        !('executable' in value) ||
        typeof value.executable !== 'string' ||
        !isAbsolute(value.executable) ||
        !('invocation' in value) ||
        typeof value.invocation !== 'string' ||
        !isAbsolute(value.invocation) ||
        !('version' in value) ||
        typeof value.version !== 'string' ||
        !value.version ||
        value.version.length > 80 ||
        !('pid' in value) ||
        typeof value.pid !== 'number' ||
        !Number.isSafeInteger(value.pid) ||
        value.pid <= 0 ||
        !('ppid' in value) ||
        typeof value.ppid !== 'number' ||
        !Number.isSafeInteger(value.ppid) ||
        value.ppid <= 0
    )
        throw new Error('Invalid Python identity schema');
    // Every required member above has been narrowed and checked at this boundary.
    return value as PythonIdentity;
}

export function verifyPythonEvidence(
    observed: unknown,
    rawJson: unknown,
    expected: ExpectedPythonIdentity,
): PythonIdentity {
    if (
        !Array.isArray(observed) ||
        observed.length > 2000 ||
        !observed.every((line): line is string => typeof line === 'string') ||
        Buffer.byteLength(observed.join('\n')) > 256 * 1024 ||
        typeof rawJson !== 'string' ||
        Buffer.byteLength(rawJson) > 8192
    )
        throw new Error('Invalid or oversized Python execution evidence');
    if (
        observed.some((line) => {
            const text = line.trimStart();
            return (
                text === 'Traceback (most recent call last):' ||
                /^(?:[\w.]*(?:Error|Exception|ExceptionGroup)|KeyboardInterrupt|SystemExit)(?::(?:\s|$)|$)/.test(
                    text,
                )
            );
        })
    )
        throw new Error('Observed Python execution error in terminal');
    const identity = parseIdentity(rawJson);
    if (
        identity.token !== expected.token ||
        identity.script !== expected.script ||
        identity.executable !== expected.canonicalInterpreter
    )
        throw new Error('Python execution identity mismatch');
    const greeting = 'Hello, world!';
    const marker = 'PYTHON_SMOKE_IDENTITY';
    const done = `PYTHON_SMOKE_COMPLETE ${expected.token}`;
    const starts = observed.flatMap((line, index) =>
        line === marker || line.startsWith(`${marker} `) ? [index] : [],
    );
    if (
        observed.filter((line) => line === greeting).length !== 1 ||
        observed.filter((line) => line === done).length !== 1 ||
        starts.length !== 1
    )
        throw new Error('Missing or duplicate Python terminal markers');
    const start = starts[0];
    let end = start;
    let reconstructed = observed[start].slice(marker.length).trimStart();
    while (reconstructed.length < rawJson.length && end + 1 < observed.length) {
        end++;
        reconstructed += observed[end];
    }
    if (
        reconstructed !== rawJson ||
        observed.indexOf(greeting) >= start ||
        observed.indexOf(done) <= end
    )
        throw new Error(
            'Partial, reordered or mismatched Python terminal evidence',
        );
    return identity;
}
