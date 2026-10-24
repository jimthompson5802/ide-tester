import { writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { reportResult } from './report.js';
import { parseArguments } from './arguments.js';
import { createRun, finishRun } from './resources.js';
import { runFoundation, runSmoke } from './runner.js';

export const checkoutRoot = fileURLToPath(
    new URL('../../../', import.meta.url),
);

export async function executeCLI(
    args: string[],
    checkout = checkoutRoot,
    qualify = false,
    output: (message: string) => void = console.log,
): Promise<number> {
    const started = Date.now();
    const suiteIndex = args.indexOf('--suite');
    const requestedSuite = suiteIndex >= 0 ? args[suiteIndex + 1] : undefined;
    const gitOnly = requestedSuite === 'git';
    const chatSelected = gitOnly
        ? false
        : qualify ||
          requestedSuite === 'chat' ||
          requestedSuite === 'basic' ||
          requestedSuite === undefined;
    const backendIndex = args.indexOf('--chat-backend');
    const chatBackend: 'real' | 'mock' =
        backendIndex >= 0 && args[backendIndex + 1] === 'real'
            ? 'real'
            : 'mock';
    const mockApplicable = chatBackend === 'mock' && !gitOnly;
    // Recover the requested presentation even when other arguments are invalid.
    const outputIndex = args.indexOf('--output');
    const mode =
        outputIndex >= 0 && args[outputIndex + 1] === 'json' ? 'json' : 'text';
    try {
        let options;
        let prerequisite: string | undefined;
        try {
            options = parseArguments(args);
        } catch (error) {
            prerequisite = String(error);
        }
        if (prerequisite || !options) {
            const run = await createRun(checkout);
            const cleanup = await finishRun(run, false, []);
            const resultPath = join(run.report, 'result.json');
            const result = {
                runId: run.id,
                scope: qualify ? 'foundation' : 'selected-suites',
                chatBackend,
                chatSelected,
                outcome: 'blocked',
                error: prerequisite,
                suites: options?.suite ?? requestedSuite,
                startedAt: new Date(started).toISOString(),
                durationMs: Date.now() - started,
                versions: {
                    node: process.version,
                    platform: process.platform,
                    architecture: process.arch,
                },
                mockRequestEvidence: mockApplicable
                    ? 'applicable'
                    : 'inapplicable',
                mockRequestCount: mockApplicable ? 0 : null,
                requests: mockApplicable ? [] : null,
                cleanup,
                resourcesPath: run.resources,
                resultPath,
            };
            await writeFile(resultPath, JSON.stringify(result, null, 2));
            return await reportResult(result, mode, output);
        }
        const result = await (qualify ? runFoundation : runSmoke)(
            options,
            checkout,
        );
        return await reportResult(result, mode, output);
    } catch (error) {
        // An existing or uncertain reservation must never be removed on this path.
        return await reportResult(
            {
                chatBackend,
                chatSelected,
                mockRequestEvidence: mockApplicable
                    ? 'applicable'
                    : 'inapplicable',
                mockRequestCount: mockApplicable ? 0 : null,
                requests: mockApplicable ? [] : null,
                outcome: 'harness_error',
                error: String(error),
            },
            mode,
            output,
        );
    }
}

if (
    process.argv[1] &&
    import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
    process.exitCode = await executeCLI(process.argv.slice(2));
}
