import { isAbsolute } from 'node:path';

export type Suite = 'editing' | 'chat' | 'all';
export interface Options { build: string; suite: Suite }

export function parseArguments(args: string[], platform: string = process.platform): Options {
  if (platform !== 'darwin') throw new Error('Only macOS is supported');
  const values = new Map<string, string>();
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i];
    const value = args[i + 1];
    if (!['--build', '--suite'].includes(key) || values.has(key) || !value || value.startsWith('--')) {
      throw new Error(`Invalid or duplicate argument: ${key}`);
    }
    values.set(key, value);
  }
  const build = values.get('--build');
  const suite = values.get('--suite') ?? 'all';
  if (!build || !isAbsolute(build) || !build.endsWith('.app')) {
    throw new Error('--build requires an absolute installed .app path');
  }
  if (suite !== 'editing' && suite !== 'chat' && suite !== 'all') {
    throw new Error('--suite must be editing, chat, or all');
  }
  return { build, suite };
}
