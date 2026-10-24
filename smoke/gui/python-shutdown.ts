import type { ChildProcess } from 'node:child_process';

export interface OwnedApplication {
    process(): Pick<
        ChildProcess,
        'exitCode' | 'signalCode' | 'once' | 'removeListener'
    >;
    close(): Promise<void>;
}

export interface ApplicationExit {
    exitCode: number | null;
    signalCode: NodeJS.Signals | null;
}

interface ShutdownBudget {
    deadline?: number;
    closeTimeoutMs?: number;
}

export async function closeOwnedApplication(
    application: OwnedApplication,
    options: ShutdownBudget = {},
): Promise<ApplicationExit> {
    const deadline = options.deadline ?? Date.now() + 120_000;
    const closeTimeoutMs = options.closeTimeoutMs ?? 60_000;
    const remaining = (): number => {
        if (!Number.isFinite(deadline) || Date.now() >= deadline)
            throw new Error('Owned application cleanup budget expired');
        return deadline - Date.now();
    };
    const wait = async <T>(
        operation: () => Promise<T>,
        maximum: number,
        label: string,
    ): Promise<T> => {
        const timeout = Math.min(remaining(), maximum);
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
            return await Promise.race([
                Promise.resolve().then(() => {
                    remaining();
                    return operation();
                }),
                new Promise<never>((_, reject) => {
                    timer = setTimeout(
                        () =>
                            reject(
                                new Error(
                                    `${label} timed out; main-process shutdown uncertain`,
                                ),
                            ),
                        Math.max(1, timeout),
                    );
                }),
            ]);
        } finally {
            clearTimeout(timer);
        }
    };
    remaining();
    if (!Number.isFinite(closeTimeoutMs) || closeTimeoutMs <= 0)
        throw new Error('Invalid owned application close budget');
    const child = application.process();
    const hasExit = (): boolean =>
        child.exitCode !== null || child.signalCode !== null;
    const observed = (): ApplicationExit => ({
        exitCode: child.exitCode,
        signalCode: child.signalCode,
    });
    if (hasExit()) return observed();

    let exitObserved: (() => void) | undefined;
    const exited = new Promise<void>((resolve) => {
        exitObserved = resolve;
    });
    // Listen before close: the main process may exit while close is resolving.
    // Its actual exit fields, not a resolved close promise, establish shutdown.
    const onExit = (): void => exitObserved?.();
    child.once('exit', onExit);
    try {
        if (!hasExit()) {
            remaining();
            await wait(
                () => application.close(),
                closeTimeoutMs,
                'Owned application close',
            );
        }
        remaining();
        if (!hasExit())
            await wait(() => exited, remaining(), 'Owned main process exit');
        remaining();
        if (!hasExit())
            throw new Error('Owned main-process exit is unconfirmed');
        return observed();
    } finally {
        child.removeListener('exit', onExit);
    }
}
