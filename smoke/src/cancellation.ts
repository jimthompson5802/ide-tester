export class CancellationError extends Error {
    constructor() {
        super('Cancelled by user');
        this.name = 'CancellationError';
    }
}

export class ScenarioStoppedError extends Error {
    constructor() {
        super('Scenario stopped');
        this.name = 'ScenarioStoppedError';
    }
}

export class Cancellation {
    private cancelled = false;
    private stopped = false;
    private readonly pending = new Set<Promise<unknown>>();
    private notify!: () => void;
    private readonly interrupted = new Promise<void>((resolve) => {
        this.notify = resolve;
    });

    get requested(): boolean {
        return this.cancelled;
    }

    request(): boolean {
        if (this.cancelled) return false;
        this.cancelled = true;
        this.notify();
        return true;
    }

    check(): void {
        if (this.cancelled) throw new CancellationError();
        if (this.stopped) throw new ScenarioStoppedError();
    }

    async perform<T>(operation: () => Promise<T>): Promise<T> {
        this.check();
        const work = this.track(
            Promise.resolve().then(async () => {
                this.check();
                const result = await operation();
                this.check();
                return result;
            }),
        );
        return Promise.race([
            work,
            this.interrupted.then(() => {
                this.check();
                throw new ScenarioStoppedError();
            }),
        ]);
    }

    track<T>(operation: Promise<T>): Promise<T> {
        this.pending.add(operation);
        void operation.then(
            () => this.pending.delete(operation),
            () => this.pending.delete(operation),
        );
        return operation;
    }

    stop(): void {
        this.stopped = true;
        this.notify();
    }

    async settle(timeoutMs: number): Promise<void> {
        this.stop();
        const deadline = Date.now() + timeoutMs;
        while (this.pending.size) {
            const remaining = deadline - Date.now();
            if (!Number.isFinite(remaining) || remaining <= 0)
                throw new Error('Pending operations settle timed out');
            let timer: ReturnType<typeof setTimeout> | undefined;
            try {
                await Promise.race([
                    Promise.allSettled([...this.pending]),
                    new Promise<never>((_, reject) => {
                        timer = setTimeout(
                            () =>
                                reject(
                                    new Error(
                                        'Pending operations settle timed out',
                                    ),
                                ),
                            remaining,
                        );
                    }),
                ]);
            } finally {
                clearTimeout(timer);
            }
        }
    }
}

export function installCancellationHandlers(
    cancellation: Cancellation,
    statusOutput: (message: string) => void,
): () => void {
    const onSignal = (): void => {
        const first = cancellation.request();
        statusOutput(
            first
                ? 'Cancellation requested; owned shutdown pending'
                : 'Owned shutdown is pending; please wait',
        );
    };
    process.on('SIGINT', onSignal);
    process.on('SIGTERM', onSignal);
    return () => {
        process.removeListener('SIGINT', onSignal);
        process.removeListener('SIGTERM', onSignal);
    };
}
