import { parentPort, workerData } from 'node:worker_threads';
import { collectCLIResult } from './cli.js';
import { Cancellation } from './cancellation.js';
import { isCLIStartup } from './cli-protocol.js';

if (!parentPort || !isCLIStartup(workerData))
    throw new Error('Invalid CLI worker startup');
const port = parentPort;
const cancellation = new Cancellation();
if (workerData.cancelled) cancellation.request();
const onMessage = (message: unknown): void => {
    if (
        message &&
        typeof message === 'object' &&
        'type' in message &&
        message.type === 'cancel'
    )
        cancellation.request();
};
port.on('message', onMessage);
try {
    const result = await collectCLIResult(
        workerData.args,
        workerData.checkout,
        false,
        cancellation,
    );
    port.postMessage(result);
} finally {
    port.off('message', onMessage);
    port.close();
}
