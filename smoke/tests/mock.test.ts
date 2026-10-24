import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startMock } from '../src/mock.js';

test('loopback discovery advertises one deterministic Chat Completions model', async (t) => {
    const mock = await startMock({ 'turn-one': 'MOCK_REPLY_ONE' });
    t.after(() => mock.close());
    assert.match(mock.url, /^http:\/\/127\.0\.0\.1:\d+$/);
    const response = await fetch(`${mock.url}/models`);
    assert.equal(response.status, 200);
    const body = (await response.json()) as {
        data: { id: string; supported_endpoints: string[] }[];
        models: unknown[];
    };
    assert.equal(body.data.length, 1);
    assert.deepEqual(
        body.models,
        [],
        'proxy inline-edit model discovery must explicitly advertise no models',
    );
    assert.equal(body.data[0].id, 'smoke-model');
    assert.deepEqual(body.data[0].supported_endpoints, ['/chat/completions']);
    assert.equal(
        ((await (await fetch(`${mock.url}/models/smoke-model`)).json()) as any)
            .id,
        'smoke-model',
    );
    assert.equal(
        (
            (await (
                await fetch(`${mock.url}/models/smoke-model/policy`)
            ).json()) as any
        ).state,
        'accepted',
    );
    assert.equal((await fetch(`${mock.url}/models/unknown`)).status, 404);
    assert.equal((await fetch(`${mock.url}/unknown`)).status, 404);
});

test('streaming replies select the latest user turn and record completed requests', async (t) => {
    const mock = await startMock({
        'turn-one': 'MOCK_REPLY_ONE',
        'turn-two': 'MOCK_REPLY_TWO',
    });
    t.after(() => mock.close());
    const response = await fetch(`${mock.url}/chat/completions`, {
        method: 'POST',
        body: JSON.stringify({
            model: 'smoke-model',
            stream: true,
            messages: [
                { role: 'user', content: '[smoke:turn-one]' },
                { role: 'assistant', content: 'MOCK_REPLY_ONE' },
                {
                    role: 'user',
                    content: [
                        { type: 'text', text: 'Follow up [smoke:turn-two]' },
                    ],
                },
            ],
        }),
    });
    assert.equal(response.status, 200);
    assert.match(
        response.headers.get('content-type') ?? '',
        /text\/event-stream/,
    );
    const stream = await response.text();
    assert.match(stream, /MOCK_REPLY_TWO/);
    assert.doesNotMatch(stream, /MOCK_REPLY_ONE/);
    assert.match(stream, /"finish_reason":"stop"/);
    assert.ok(stream.endsWith('data: [DONE]\n\n'));
    assert.deepEqual(mock.requests(), [
        {
            sequence: 1,
            marker: 'turn-two',
            reply: 'MOCK_REPLY_TWO',
            completed: true,
        },
    ]);
});

test('synthetic token and model sessions point only at the owned mock', async (t) => {
    const mock = await startMock({});
    t.after(() => mock.close());
    const token = (await (
        await fetch(`${mock.url}/copilot_internal/v2/token`)
    ).json()) as any;
    assert.equal(token.token, 'smoke-synthetic-token');
    assert.deepEqual(token.endpoints, { api: mock.url, proxy: mock.url });
    const session = (await (
        await fetch(`${mock.url}/models/session`, {
            method: 'POST',
            body: '{}',
        })
    ).json()) as any;
    assert.deepEqual(session.available_models, ['smoke-model']);
    assert.equal(session.selected_model, 'smoke-model');
    assert.equal(
        (
            await fetch(`${mock.url}/models/session`, {
                method: 'POST',
                body: '{',
            })
        ).status,
        400,
    );
});

test('malformed completions and stale markers cannot generate replies', async (t) => {
    const mock = await startMock({ known: 'EXPECTED_REPLY' });
    t.after(() => mock.close());
    const base = {
        model: 'smoke-model',
        stream: true,
        messages: [{ role: 'user', content: '[smoke:known]' }],
    };
    for (const body of [
        '{',
        'null',
        '[]',
        JSON.stringify({ ...base, model: 'external-model' }),
        JSON.stringify({ ...base, stream: false }),
        JSON.stringify({ ...base, messages: [] }),
        JSON.stringify({
            ...base,
            messages: [{ role: 'user', content: '[smoke:unknown]' }],
        }),
        JSON.stringify({
            ...base,
            messages: [
                ...base.messages,
                { role: 'user', content: 'No current marker' },
            ],
        }),
        JSON.stringify({
            ...base,
            messages: [
                { role: 'user', content: '[smoke:known] [smoke:known]' },
            ],
        }),
    ]) {
        const response = await fetch(`${mock.url}/chat/completions`, {
            method: 'POST',
            body,
        });
        assert.equal(response.status, 400);
        assert.doesNotMatch(await response.text(), /EXPECTED_REPLY/);
    }
    assert.deepEqual(mock.requests(), []);
});
