import { glob, readFile } from 'node:fs/promises';
import { join } from 'node:path';

// VS Code 1.135 logs the local view's conversation URI when it binds/selects a model.
// Combine this identity with the visible prompt marker; neither alone proves a turn.
export function sessionFromLog(log: string): string {
    let session = '';
    for (const line of log.split('\n')) {
        if (
            !line.includes('[ChatModelSelection]') ||
            !line.includes('surface="workbench"') ||
            !line.includes('widgetViewKind="view"')
        )
            continue;
        const uri = /conversationKey="([^"]+)"/.exec(line)?.[1] ?? '';
        session =
            line.includes('sessionKey="local"') &&
            uri.startsWith('vscode-chat-session://local/')
                ? uri
                : '';
    }
    return session;
}

export async function rendererLogs(userData: string): Promise<string[]> {
    const logs: string[] = [];
    for await (const file of glob('logs/*/window1/renderer.log', {
        cwd: userData,
    }))
        logs.push(file);
    return logs;
}

export async function readLocalSession(
    userData: string,
    previousLogs: readonly string[] = [],
): Promise<string> {
    const logs = (await rendererLogs(userData)).filter(
        (file) => !previousLogs.includes(file),
    );
    if (logs.length !== 1) return '';
    return sessionFromLog(await readFile(join(userData, logs[0]), 'utf8'));
}
