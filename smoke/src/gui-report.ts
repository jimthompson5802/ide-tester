export type GUIOutcome =
    'passed' | 'blocked' | 'failed' | 'harness_error' | 'not_run';
export type GUIStageState =
    'not_run' | 'running' | 'passed' | 'blocked' | 'harness_error';
export interface GUIRow {
    suite: 'basic' | 'git' | 'python';
    backend: 'real' | 'inapplicable';
    outcome: GUIOutcome;
    durationMs?: number;
    resultPath?: string;
    error?: string;
    cleanup?: {
        disposition?: string;
        reservationRetained?: boolean;
        errors?: string[];
    };
    cancellation?: { reason: string };
    originatingOutcome?: string;
    originating?: { outcome: string; error?: string };
    outputError?: string;
    subprocessError?: string;
    reportingError?: string;
}
export interface GUIBatch {
    batchId: string;
    activeStage?: 'build' | 'preflight' | 'basic' | 'git' | 'python';
    state: 'incomplete' | 'running' | 'completed';
    outcome: GUIOutcome;
    build: { state: GUIStageState; error?: string };
    preflight: { state: GUIStageState; error?: string };
    rows: GUIRow[];
    durationMs: number;
    cancellation?: { reason: string };
    error?: string;
    reportingErrors: string[];
}
interface SharedReporter {
    createGUIRecord(batchId: string): GUIBatch;
    createGUIReport(
        checkoutRoot: string,
        batchId?: string,
    ): Promise<{ directory: string; batch: GUIBatch }>;
    saveGUIReport(directory: string, batch: GUIBatch): Promise<void>;
    formatGUISummary(batch: GUIBatch): string;
}
const scripts = import.meta.url.includes('/dist/src/') ? '../..' : '..';
const reporter: SharedReporter = await import(
    new URL(`${scripts}/scripts/gui-bootstrap-report.mjs`, import.meta.url).href
);
export function createGUIRecord(batchId: string): GUIBatch {
    return reporter.createGUIRecord(batchId);
}
export function createGUIReport(
    checkoutRoot: string,
    batchId?: string,
): Promise<{ directory: string; batch: GUIBatch }> {
    return reporter.createGUIReport(checkoutRoot, batchId);
}
export function saveGUIReport(
    directory: string,
    batch: GUIBatch,
): Promise<void> {
    return reporter.saveGUIReport(directory, batch);
}
export function formatGUISummary(batch: GUIBatch): string {
    return reporter.formatGUISummary(batch);
}
