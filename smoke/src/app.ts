import { access, readFile, realpath, stat } from 'node:fs/promises';
import { constants } from 'node:fs';
import { basename, join, relative, isAbsolute } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

export interface InstalledApp { app: string; executable: string; vscode: string; copilot: string }

export async function resolveApp(input: string): Promise<InstalledApp> {
  const app = await realpath(input);
  if (!input.endsWith('.app') || !(await stat(app)).isDirectory()) throw new Error('Invalid installed .app');
  let executable: string;
  try {
    const { stdout } = await promisify(execFile)('/usr/bin/plutil', [
      '-extract', 'CFBundleExecutable', 'raw', '-o', '-', join(app, 'Contents/Info.plist'),
    ]);
    const name = stdout.trim();
    if (!name || basename(name) !== name || name === '..') throw new Error('Invalid executable name');
    executable = await realpath(join(app, 'Contents/MacOS', name));
    const inside = relative(app, executable);
    if (inside.startsWith('..') || isAbsolute(inside)) throw new Error('Executable escapes app');
    if (!(await stat(executable)).isFile()) throw new Error('Executable is not a file');
    await access(executable, constants.X_OK);
  } catch (cause) { throw new Error('Cannot resolve installed app executable', { cause }); }
  const resources = join(app, 'Contents/Resources/app');
  const meta = JSON.parse(await readFile(join(resources, 'package.json'), 'utf8'));
  const copilot = JSON.parse(await readFile(join(resources, 'extensions/copilot/package.json'), 'utf8'));
  if (typeof meta.version !== 'string' || copilot.name !== 'copilot-chat' || typeof copilot.version !== 'string') {
    throw new Error('Missing VS Code or bundled Copilot Chat version');
  }
  return { app, executable, vscode: meta.version, copilot: copilot.version };
}
