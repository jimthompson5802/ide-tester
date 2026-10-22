import { writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

export interface ReportResult {
  runId?: string; scope?: string; chatBackend?: 'mock' | 'real'; outcome: string; error?: string; durationMs?: number;
  checks?: { suite: string; outcome: string; durationMs?: number; error?: string }[];
  cleanup?: { disposition?: string; reservationRetained?: boolean; errors?: string[] };
  resourcesPath?: string; resultPath?: string;
}

const labels: Record<string, string> = {
  passed: 'PASSED', failed: 'FAILED', blocked: 'BLOCKED', harness_error: 'HARNESS ERROR', not_run: 'NOT RUN',
};
const status = (value?: string) => value ? labels[value] ?? 'Unavailable' : 'Unavailable';
const duration = (ms?: number) => ms === undefined ? 'Unavailable' : `${(ms / 1000).toFixed(3)} seconds`;

export function formatResult(result: ReportResult): string {
  const lines = [`Smoke test: ${status(result.outcome)}`, `Run ID: ${result.runId ?? 'Unavailable'}`,
    `Scope: ${result.scope === 'foundation' ? 'Foundation' : result.scope === 'selected-suites' ? 'Selected suites' : 'Unavailable'}`, ...(result.chatBackend ? [`Chat backend: ${result.chatBackend}`] : []), '',
    'Suite       Result        Duration'];
  if (!result.checks?.length) lines.push('Suite information: Unavailable');
  for (const check of result.checks ?? []) {
    const name = check.suite.charAt(0).toUpperCase() + check.suite.slice(1);
    lines.push(`${name.padEnd(12)}${status(check.outcome).padEnd(14)}${duration(check.durationMs)}`);
    if (check.error) lines.push(`  Reason: ${check.error}`);
  }
  lines.push('', `Harness disposition: ${status(result.outcome)}`,
    `Resources: ${result.cleanup?.disposition === 'removed' ? 'Removed' : result.cleanup?.disposition === 'retained' ? 'Retained' : 'Unavailable'}`,
    `Reservation: ${result.cleanup?.reservationRetained === true ? 'Retained' : result.cleanup?.reservationRetained === false ? 'Released' : 'Unavailable'}`,
    `Duration: ${duration(result.durationMs)}`);
  if (result.error) lines.push(`Failure reason: ${result.error}`);
  for (const error of result.cleanup?.errors ?? []) lines.push(`Cleanup error: ${error}`);
  if (result.cleanup?.disposition === 'retained' && result.resourcesPath) lines.push(`Resource path: ${result.resourcesPath}`);
  lines.push(`JSON report: ${result.resultPath ?? 'Unavailable'}`);
  return lines.join('\n');
}

export async function reportResult(result: ReportResult, mode: 'text' | 'json', output: (message: string) => void): Promise<number> {
  const summary = formatResult(result);
  try {
    if (result.resultPath) await writeFile(join(dirname(result.resultPath), 'result.txt'), summary + '\n');
  } catch (error) {
    const reportingError = `Reporting error: could not write result.txt: ${String(error)}; JSON report: ${result.resultPath}`;
    output(mode === 'json' ? JSON.stringify({ ...result, reportingError }) : summary + '\n' + reportingError);
    return 1;
  }
  output(mode === 'json' ? JSON.stringify(result) : summary);
  return result.outcome === 'passed' ? 0 : 1;
}
