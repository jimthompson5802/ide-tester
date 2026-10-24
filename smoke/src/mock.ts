import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { IncomingMessage } from 'node:http';

export function syntheticToken(url: string) {
    return {
        token: 'smoke-synthetic-token',
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        refresh_in: 1800,
        sku: 'free_limited_copilot',
        individual: true,
        isNoAuthUser: true,
        copilot_plan: 'free',
        organization_login_list: [],
        endpoints: { api: url, proxy: url },
    };
}

async function readJson(req: IncomingMessage): Promise<any> {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of req) {
        size += chunk.length;
        if (size > 1024 * 1024) throw new Error('Request exceeds 1 MiB');
        chunks.push(Buffer.from(chunk));
    }
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!body || Array.isArray(body) || typeof body !== 'object')
        throw new Error('Expected JSON object');
    return body;
}

export const model = {
    id: 'smoke-model',
    name: 'Smoke Mock',
    object: 'model',
    version: 'smoke-model',
    vendor: 'OpenAI',
    model_picker_enabled: true,
    is_chat_default: true,
    is_chat_fallback: true,
    capabilities: {
        type: 'chat',
        family: 'gpt-4o',
        tokenizer: 'o200k_base',
        object: 'model_capabilities',
        limits: { max_prompt_tokens: 32000, max_output_tokens: 4096 },
        supports: { streaming: true, tool_calls: false, vision: false },
    },
    supported_endpoints: ['/chat/completions'],
};

export interface MockRequest {
    sequence: number;
    marker: string;
    reply: string;
    completed: boolean;
}

function latestMarker(body: any): string {
    if (
        body.model !== model.id ||
        body.stream !== true ||
        !Array.isArray(body.messages)
    )
        throw new Error('Unsupported completion');
    const message = body.messages.findLast((m: any) => m?.role === 'user');
    const content =
        typeof message?.content === 'string'
            ? message.content
            : Array.isArray(message?.content)
              ? message.content
                    .filter((p: any) => p?.type === 'text')
                    .map((p: any) => p.text)
                    .join('\n')
              : '';
    const markers = [...content.matchAll(/\[smoke:([a-zA-Z0-9-]+)\]/g)];
    if (markers.length !== 1)
        throw new Error('Expected exactly one latest-user marker');
    return markers[0][1];
}

export async function startMock(replies: Record<string, string>) {
    let url = '';
    const requests: MockRequest[] = [];
    const server = createServer((req, res) => {
        void (async () => {
            const path = new URL(req.url ?? '/', 'http://localhost').pathname;
            res.setHeader('Content-Type', 'application/json');
            if (path === '/models' && req.method === 'GET')
                res.end(JSON.stringify({ data: [model], models: [] }));
            else if (path === `/models/${model.id}` && req.method === 'GET')
                res.end(JSON.stringify(model));
            else if (
                path === `/models/${model.id}/policy` &&
                req.method === 'GET'
            )
                res.end(JSON.stringify({ state: 'accepted', terms: '' }));
            else if (
                [
                    '/copilot_internal/v2/token',
                    '/copilot_internal/v2/nltoken',
                ].includes(path) &&
                req.method === 'GET'
            ) {
                res.end(JSON.stringify(syntheticToken(url)));
            } else if (
                ['/models/session', '/models/session/intent'].includes(path) &&
                req.method === 'POST'
            ) {
                await readJson(req);
                res.end(
                    JSON.stringify(
                        path.endsWith('/intent')
                            ? { model: model.id }
                            : {
                                  available_models: [model.id],
                                  selected_model: model.id,
                                  session_token: 'smoke-session',
                                  expires_at:
                                      Math.floor(Date.now() / 1000) + 3600,
                                  discounted_costs: {},
                              },
                    ),
                );
            } else if (path === '/chat/completions' && req.method === 'POST') {
                const marker = latestMarker(await readJson(req));
                const reply = Object.hasOwn(replies, marker)
                    ? replies[marker]
                    : undefined;
                if (reply === undefined) throw new Error('Unknown marker');
                const request: MockRequest = {
                    sequence: requests.length + 1,
                    marker,
                    reply,
                    completed: false,
                };
                requests.push(request);
                res.setHeader('Content-Type', 'text/event-stream');
                res.setHeader('Cache-Control', 'no-cache');
                const chunk = (
                    delta: object,
                    finish_reason: string | null,
                ) => ({
                    id: `smoke-${request.sequence}`,
                    object: 'chat.completion.chunk',
                    created: Math.floor(Date.now() / 1000),
                    model: model.id,
                    choices: [{ index: 0, delta, finish_reason }],
                });
                res.write(
                    `data: ${JSON.stringify(chunk({ role: 'assistant', content: reply }, null))}\n\n`,
                );
                res.write(`data: ${JSON.stringify(chunk({}, 'stop'))}\n\n`);
                res.once('finish', () => {
                    request.completed = true;
                });
                res.end('data: [DONE]\n\n');
            } else {
                res.statusCode = 404;
                res.end(JSON.stringify({ error: 'Unsupported mock endpoint' }));
            }
        })().catch(() => {
            if (!res.headersSent) {
                res.statusCode = 400;
                res.end(JSON.stringify({ error: 'Malformed mock request' }));
            } else res.destroy();
        });
    });
    await new Promise<void>((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => {
            server.off('error', reject);
            resolve();
        });
    });
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    return {
        url,
        requests: (): MockRequest[] =>
            requests.map((request) => ({ ...request })),
        close: () =>
            new Promise<void>((resolve, reject) => {
                server.close((error) => (error ? reject(error) : resolve()));
                server.closeAllConnections();
            }),
    };
}
