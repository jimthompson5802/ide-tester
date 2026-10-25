import { Worker } from 'node:worker_threads';
import { Cancellation, installCancellationHandlers } from './cancellation.js';
import { isCLIResult, type CLIStartup } from './cli-protocol.js';
import { reportResult, type ReportResult } from './report.js';

interface ControllerServices {
    workerURL?: URL;
    cancellation?: Cancellation;
    output?: (message: string) => void;
    statusOutput?: (message: string) => void;
}

export async function runCLIController(
    args: string[],
    checkout: string,
    services: ControllerServices = {},
): Promise<number> {
    const cancellation = services.cancellation ?? new Cancellation();
    let worker: Worker | undefined;
    let sent = false;
    let failure: string | undefined;
    const dispose = installCancellationHandlers(cancellation, (message) => {
        if (worker && !sent) {
            sent = true;
            try {
                worker.postMessage({ type: 'cancel' });
            } catch {
                failure =
                    'Worker cancellation delivery failed; cleanup uncertain';
            }
        }
        (
            services.statusOutput ??
            ((text: string) => process.stderr.write(text + '\n'))
        )(message);
    });
    let result: ReportResult | undefined;
    try {
        try {
            const startup: CLIStartup = {
                args,
                checkout,
                cancelled: cancellation.requested,
            };
            sent = cancellation.requested;
            worker = new Worker(
                services.workerURL ??
                    new URL('./cli-worker.js', import.meta.url),
                {
                    workerData: startup,
                    execArgv: [],
                    stdout: true,
                    stderr: true,
                },
            );
            // Worker stdout is never a second result channel. Private launcher errors stay private.
            worker.stdout.resume();
            worker.stderr.resume();
            const current = worker;
            const code = await new Promise<number>((resolve) => {
                current.on('message', (message: unknown) => {
                    if (result || !isCLIResult(message))
                        failure =
                            'Invalid or duplicate worker result; cleanup uncertain';
                    else result = message;
                });
                current.once('error', () => {
                    failure = 'CLI worker failed; cleanup uncertain';
                });
                current.once('exit', resolve);
            });
            if (code !== 0)
                failure ??= 'CLI worker exited abnormally; cleanup uncertain';
            if (!result)
                failure ??=
                    'CLI worker exited without a result; cleanup uncertain';
        } catch {
            failure = 'CLI worker startup failed; cleanup uncertain';
        }
        if (failure) result = { outcome: 'harness_error', error: failure };
        const index = args.indexOf('--output');
        return await reportResult(
            result ?? {
                outcome: 'harness_error',
                error: 'Worker result unavailable',
            },
            index >= 0 && args[index + 1] === 'json' ? 'json' : 'text',
            services.output ?? console.log,
            cancellation,
        );
    } finally {
        dispose();
        worker?.removeAllListeners();
    }
}
