import { bounded } from '../src/workbench.js';

// Specific to the feasibility walkthrough. Pending UI calls must settle after
// owned app shutdown before finishRun may delete resources or release the lock.
export class WalkthroughDeadline {
    private readonly end: number;
    private stageEnd: number;
    private label = 'prepare';
    private stopped = false;
    private timedOut = false;
    private readonly pending = new Set<Promise<unknown>>();

    constructor(
        timeoutMs: number,
        private readonly now: () => number = Date.now,
    ) {
        this.end = now() + timeoutMs;
        this.stageEnd = this.end;
    }

    get expired(): boolean {
        return this.timedOut;
    }

    remaining(limit = 15_000): number {
        if (this.now() >= Math.min(this.end, this.stageEnd)) {
            this.timedOut = true;
            this.stopped = true;
        }
        if (this.timedOut)
            throw new Error(`Walkthrough expired at ${this.label}`);
        if (this.stopped) throw new Error('Walkthrough stopped');
        return Math.min(
            limit,
            this.end - this.now(),
            this.stageEnd - this.now(),
        );
    }

    stage(label: string, budgetMs: number): void {
        this.remaining();
        this.label = label;
        this.stageEnd = Math.min(this.end, this.now() + budgetMs);
    }

    async perform<T>(operation: () => Promise<T>): Promise<T> {
        const timeoutMs = this.remaining(Number.MAX_SAFE_INTEGER);
        const work = Promise.resolve().then(async () => {
            this.remaining();
            const result = await operation();
            this.remaining();
            return result;
        });
        this.pending.add(work);
        // Both handlers consume completion, including after the caller timed out.
        void work.then(
            () => this.pending.delete(work),
            () => this.pending.delete(work),
        );
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
            return await Promise.race([
                work,
                new Promise<never>((_, reject) => {
                    timer = setTimeout(() => {
                        this.timedOut = true;
                        this.stopped = true;
                        reject(
                            new Error(`Walkthrough expired at ${this.label}`),
                        );
                    }, timeoutMs);
                }),
            ]);
        } finally {
            clearTimeout(timer);
        }
    }

    stop(): void {
        this.stopped = true;
    }

    async settle(timeoutMs: number): Promise<void> {
        this.stop();
        await bounded(
            Promise.allSettled([...this.pending]),
            timeoutMs,
            'Walkthrough pending operations settle',
        );
    }
}
