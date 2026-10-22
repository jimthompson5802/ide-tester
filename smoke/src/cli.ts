import { writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArguments } from './arguments.js';
import { createRun, finishRun } from './resources.js';
import { runFoundation, runSmoke } from './runner.js';

export const checkoutRoot = fileURLToPath(new URL('../../../', import.meta.url));

export async function executeCLI(args: string[], checkout = checkoutRoot, qualify = false, output: (message: string) => void = console.log): Promise<number> {
  const started = Date.now();
  try {
    let options;
    let prerequisite: string | undefined;
    try {
      options = parseArguments(args);
    } catch (error) { prerequisite = String(error); }
    if (prerequisite || !options) {
      const run = await createRun(checkout);
      const cleanup = await finishRun(run, false, []);
      const resultPath = join(run.report, 'result.json');
      const result = { runId: run.id, scope: qualify ? 'foundation' : 'selected-suites',
        outcome: 'blocked', error: prerequisite, suites: options?.suite,
        startedAt: new Date(started).toISOString(), durationMs: Date.now() - started,
        versions: { node: process.version, platform: process.platform, architecture: process.arch },
        mockRequestCount: 0, cleanup, resourcesPath: run.resources, resultPath };
      await writeFile(resultPath, JSON.stringify(result, null, 2));
      output(JSON.stringify(result));
      return 1;
    }
    const result = await (qualify ? runFoundation : runSmoke)(options, checkout);
    output(JSON.stringify(result));
    return result.outcome === 'passed' ? 0 : 1;
  } catch (error) {
    // An existing or uncertain reservation must never be removed on this path.
    output(JSON.stringify({ outcome: 'harness_error', error: String(error) }));
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exitCode = await executeCLI(process.argv.slice(2));
}
