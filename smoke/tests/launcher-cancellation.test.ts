import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

for (const mode of ['baseline', 'SIGINT', 'SIGTERM', 'repeated'] as const)
    test(
        `actual Playwright pending launcher cancellation: ${mode}`,
        { timeout: 15000 },
        async (t) => {
            const root = await mkdtemp('/private/tmp/launcher-cancel-');
            // A real Node inspector lets Playwright settle its pending endpoint waits.
            // This is an inert Node process, not Electron, and opens no desktop window.
            await writeFile(
                join(root, 'idle.cjs'),
                `const fs = require('node:fs');\nfs.writeFileSync(${JSON.stringify(join(root, 'launched'))}, String(process.pid));\nconst timer=setInterval(()=>{if(fs.existsSync(${JSON.stringify(join(root, 'finish'))})){clearInterval(timer);process.exitCode=0;}},20);\n`,
            );
            await writeFile(
                join(root, 'pending-electron'),
                `#!/bin/sh\nexec '${process.execPath}' --inspect=0 '${root}/idle.cjs'\n`,
                { mode: 0o700 },
            );
            const child = spawn(
                process.execPath,
                [
                    new URL(
                        './fixtures/launcher-cancellation-worker.js',
                        import.meta.url,
                    ).pathname,
                    root,
                    mode,
                ],
                { stdio: ['ignore', 'pipe', 'pipe'] },
            );
            let stdout = '';
            child.stdout.on('data', (value: Buffer) => {
                stdout += value.toString();
            });
            child.stderr.resume();
            const closed = new Promise<number | null>((resolve, reject) => {
                child.once('error', reject);
                child.once('close', resolve);
            });
            t.after(async () => {
                await writeFile(join(root, 'finish'), 'done');
                await closed;
                await rm(root, { recursive: true, force: true });
            });
            const deadline = Date.now() + 5000;
            while (true) {
                try {
                    await readFile(join(root, 'launched'));
                    break;
                } catch {
                    assert.ok(
                        Date.now() < deadline,
                        'installed launcher did not start fixture',
                    );
                    await delay(10);
                }
            }
            child.kill(mode === 'SIGTERM' ? 'SIGTERM' : 'SIGINT');
            if (mode === 'repeated') {
                await delay(20);
                child.kill('SIGTERM');
                child.kill('SIGINT');
            }
            await delay(100);
            await writeFile(join(root, 'finish'), 'done');
            const code = await closed;
            const ownedPID = Number(
                await readFile(join(root, 'launched'), 'utf8'),
            );
            assert.throws(() => process.kill(ownedPID, 0));
            if (mode === 'baseline') {
                assert.equal(code, 130);
                assert.equal(stdout, '');
                return;
            }
            assert.equal(
                code,
                1,
                `tester must finalize instead of premature launcher exit; stdout=${stdout}`,
            );
            assert.equal(
                JSON.parse(stdout).cancellation.reason,
                'Cancelled by user',
            );
            assert.equal(
                await readFile(join(root, 'finalized'), 'utf8'),
                'settled',
            );
        },
    );
