import { _electron, type ElectronApplication } from '@playwright/test';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArguments } from './arguments.js';
import { resolveApp } from './app.js';
import { createRun, finishRun } from './resources.js';
import { backendLaunch, realProfile, requireClosedProfile } from './real-profile.js';
import { checkoutRoot } from './cli.js';
import { bounded } from './workbench.js';

export async function setupRealChat(args: string[], checkout = checkoutRoot): Promise<void> {
  if (args.some((arg, index) => index % 2 === 0 && arg !== '--build')) throw new Error('Setup accepts only --build');
  const options = parseArguments(args);
  const run = await createRun(checkout);
  let app: ElectronApplication | undefined;
  let attempted = false;
  let succeeded = false;
  try {
    const installed = await resolveApp(options.build);
    if (process.platform !== 'darwin' || process.arch !== 'arm64' || process.version !== 'v26.3.1' ||
        installed.vscode !== '1.135.0' || installed.copilot !== '0.63.0') {
      throw new Error('Setup requires macOS arm64, Node 26.3.1, VS Code 1.135.0 / Copilot Chat 0.63.0');
    }
    const profile = await realProfile(checkout, true);
    await requireClosedProfile(profile);
    const config = backendLaunch('real', profile);
    attempted = true;
    app = await _electron.launch({ executablePath: installed.executable, timeout: 60_000,
      env: config.env, args: [run.workspace, '--new-window', ...config.args,
        '--skip-welcome', '--skip-release-notes', '--locale=en'] });
    const page = await app.firstWindow({ timeout: 60_000 });
    console.log('Sign in manually using VS Code’s Copilot setup workflow: https://code.visualstudio.com/docs/setup/copilot');
    console.log('Device-code sign-in is preferred. Click “Copy & Continue to Browser”, enter the code manually on GitHub, and finish authorization.');
    console.log('Close this dedicated VS Code window when finished. No authentication screenshots or traces are recorded.');
    if (!page.isClosed()) await new Promise<void>(resolve => page.once('close', () => resolve()));
    succeeded = true;
  } finally {
    const cleanup = await finishRun(run, succeeded, [async () => {
      if (app) {
        const child = app.process();
        if (child.exitCode === null && child.signalCode === null) await bounded(app.close(), 10_000, 'Setup shutdown');
        if (child.exitCode === null && child.signalCode === null) {
          await bounded(new Promise<void>(resolve => child.once('exit', () => resolve())), 5000, 'Setup process exit');
        }
      } else if (attempted) throw new Error('Setup launch uncertain; inspect the owned process before recovering the reservation');
    }]);
    if (cleanup.errors.length) throw new Error(cleanup.errors.join('\n'));
  }
  console.log('Setup instance closed; persistent profile preserved. Sign-in is checked by the real Chat test.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { await setupRealChat(process.argv.slice(2)); }
  catch (error) { console.error(String(error)); process.exitCode = 1; }
}
