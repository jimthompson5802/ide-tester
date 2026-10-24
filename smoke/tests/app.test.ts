import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    mkdtemp,
    mkdir,
    writeFile,
    chmod,
    rm,
    realpath,
} from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { resolveApp } from '../src/app.js';

test('app resolution reads installed metadata and refuses missing or escaping executables', async (t) => {
    const root = await realpath(
        await mkdtemp(join(tmpdir(), 'smoke-app-test-')),
    );
    t.after(() => rm(root, { recursive: true, force: true }));
    const app = join(root, 'Code.app');
    const resources = join(app, 'Contents/Resources/app');
    await mkdir(join(resources, 'extensions/copilot'), { recursive: true });
    await mkdir(join(app, 'Contents/MacOS'), { recursive: true });
    await writeFile(
        join(app, 'Contents/Info.plist'),
        '<?xml version="1.0"?><plist version="1.0"><dict><key>CFBundleExecutable</key><string>Electron</string></dict></plist>',
    );
    await writeFile(join(resources, 'package.json'), '{"version":"1.135.0"}');
    await writeFile(
        join(resources, 'extensions/copilot/package.json'),
        '{"name":"copilot-chat","version":"0.63.0"}',
    );
    await assert.rejects(resolveApp(app), /executable/i);
    const executable = join(app, 'Contents/MacOS/Electron');
    await writeFile(executable, 'fixture only');
    await chmod(executable, 0o700);
    assert.deepEqual(await resolveApp(app), {
        app,
        executable,
        vscode: '1.135.0',
        copilot: '0.63.0',
    });
    await writeFile(
        join(app, 'Contents/Info.plist'),
        '<plist><dict><key>CFBundleExecutable</key><string>../../outside</string></dict></plist>',
    );
    await assert.rejects(resolveApp(app), /executable/i);
});
