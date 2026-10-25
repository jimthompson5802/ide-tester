import { _electron } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
    Cancellation,
    installCancellationHandlers,
} from '../../src/cancellation.js';
import { isMainThread, parentPort, workerData } from 'node:worker_threads';
import { runCLIController } from '../../src/cli-controller.js';
import { isCLIStartup } from '../../src/cli-protocol.js';

async function launchFixture(root: string, cancellation: Cancellation) {
    try {
        await _electron.launch({
            executablePath: join(root, 'pending-electron'),
            timeout: 3000,
        });
    } catch {
        await writeFile(join(root, 'finalized'), 'settled');
    }
    return {
        outcome: 'harness_error',
        cancellation: cancellation.requested
            ? { reason: 'Cancelled by user' }
            : undefined,
    };
}

if (isMainThread) {
    if (process.argv[3] === 'baseline') {
        const cancellation = new Cancellation();
        const dispose = installCancellationHandlers(cancellation, () => {});
        try {
            console.log(
                JSON.stringify(
                    await launchFixture(process.argv[2], cancellation),
                ),
            );
            process.exitCode = 1;
        } finally {
            dispose();
        }
    } else {
        process.exitCode = await runCLIController(
            [process.argv[2], '--output', 'json'],
            process.argv[2],
            { workerURL: new URL(import.meta.url) },
        );
    }
} else {
    if (!parentPort || !isCLIStartup(workerData))
        throw new Error('Invalid fixture startup');
    const port = parentPort;
    const cancellation = new Cancellation();
    if (workerData.cancelled) cancellation.request();
    port.on('message', () => {
        cancellation.request();
    });
    try {
        port.postMessage(await launchFixture(workerData.args[0], cancellation));
    } finally {
        port.removeAllListeners();
        port.close();
    }
}
