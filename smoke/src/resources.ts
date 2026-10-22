import { mkdir, mkdtemp, open, realpath, writeFile, readFile, rm, lstat } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

export interface Run {
  id: string; report: string; resources: string; workspace: string;
  userData: string; extensions: string; state: string; reservation: string;
}

export async function createRun(checkout: string): Promise<Run> {
  const reports = join(await realpath(checkout), 'reports');
  await mkdir(reports, { recursive: true });
  if (await realpath(reports) !== reports) throw new Error('Report ownership mismatch');
  const root = join(reports, 'smoke');
  await mkdir(root, { recursive: true });
  if (await realpath(root) !== root) throw new Error('Report ownership mismatch');
  const reservation = join(root, '.reservation');
  const id = `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID()}`;
  try {
    const handle = await open(reservation, 'wx', 0o600);
    try { await handle.writeFile(JSON.stringify({ id, pid: process.pid })); }
    finally { await handle.close(); }
  } catch (cause) { throw new Error(`Run reservation exists or cannot be created: ${reservation}; inspect deliberately before recovery`, { cause }); }
  const report = join(root, id);
  await mkdir(report);
  // Darwin's sockaddr_un path limit is 103 bytes, including VS Code's socket name.
  const resources = await mkdtemp('/private/tmp/ide-smoke-');
  await writeFile(join(report, 'resources.json'), JSON.stringify({ id, resources }), { flag: 'wx', mode: 0o600 });
  const run: Run = { id, report, resources, reservation, workspace: join(resources, 'workspace'),
    userData: join(resources, 'user-data'), extensions: join(resources, 'extensions'), state: join(resources, 'copilot-state') };
  // Any partial setup failure deliberately retains the reservation for inspection.
  for (const dir of [run.workspace, run.userData, run.extensions, run.state]) await mkdir(dir, { recursive: true });
  await writeFile(join(resources, '.owner'), id, { flag: 'wx', mode: 0o600 });
  await writeFile(join(run.workspace, 'existing.txt'), 'Initial smoke fixture\n', { flag: 'wx' });
  return run;
}

export async function finishRun(run: Run, passed: boolean, shutdown: (() => Promise<void>)[]) {
  const errors: string[] = [];
  for (const close of shutdown) {
    try { await close(); } catch (error) { errors.push(String(error)); }
  }
  let disposition = 'retained';
  if (errors.length === 0) {
    try {
      if (await realpath(run.report) !== run.report || await realpath(run.resources) !== run.resources || (await lstat(run.resources)).isSymbolicLink() || await readFile(join(run.resources, '.owner'), 'utf8') !== run.id) {
        throw new Error('Resource ownership mismatch');
      }
      const lock = JSON.parse(await readFile(run.reservation, 'utf8'));
      if (lock.id !== run.id) throw new Error('Reservation ownership mismatch');
      if (passed) {
        await rm(run.resources, { recursive: true });
        disposition = 'removed';
      }
      await rm(run.reservation);
    } catch (error) { errors.push(String(error)); }
  }
  return { disposition, errors, reservationRetained: errors.length > 0 };
}
