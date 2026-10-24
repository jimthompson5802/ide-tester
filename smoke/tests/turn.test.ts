import { test } from 'node:test';
import assert from 'node:assert/strict';
import { turnCompleted } from '../src/turn.js';

test('latest-turn verification requires a new completed request and assistant bubble in the same session', () => {
    const before = {
        session: 'local-session-1',
        responseCount: 1,
        requestSequence: 1,
        priorTurns: [{ marker: 'turn-one', reply: 'MOCK_REPLY_ONE' }],
    };
    const bubble = { text: 'MOCK_REPLY_TWO', completed: true };
    const request = {
        sequence: 2,
        marker: 'turn-two',
        reply: 'MOCK_REPLY_TWO',
        completed: true,
    };
    const current = {
        session: 'local-session-1',
        prompts: [
            'First prompt [smoke:turn-one]',
            'Follow up [smoke:turn-two]',
        ],
        responses: [{ text: 'MOCK_REPLY_ONE', completed: true }, bubble],
        requests: [request],
    };
    assert.equal(
        turnCompleted(before, current, 'turn-two', 'MOCK_REPLY_TWO'),
        true,
    );
    for (const invalid of [
        { ...current, session: 'replaced-session' },
        { ...current, prompts: [] },
        { ...current, prompts: ['Old prompt [smoke:turn-one]'] },
        {
            ...current,
            prompts: ['Replaced first prompt', 'Follow up [smoke:turn-two]'],
        },
        {
            ...current,
            responses: [
                { text: 'REPLACED_FIRST_REPLY', completed: true },
                bubble,
            ],
        },
        { ...current, responses: [bubble] },
        { ...current, responses: [bubble, { ...bubble, completed: false }] },
        { ...current, responses: [bubble, { ...bubble, text: 'MOCK_REPLY_' }] },
        {
            ...current,
            responses: [bubble, { ...bubble, text: 'MOCK_REPLY_TWO extra' }],
        },
        { ...current, requests: [] },
        { ...current, requests: [{ ...request, sequence: 1 }] },
        { ...current, requests: [{ ...request, marker: 'turn-one' }] },
        { ...current, requests: [{ ...request, completed: false }] },
    ])
        assert.equal(
            turnCompleted(before, invalid, 'turn-two', 'MOCK_REPLY_TWO'),
            false,
        );
});

test('real turns require fresh complete exact replies without mock request evidence', () => {
    const before = {
        session: 'local-session',
        responseCount: 1,
        requestSequence: 0,
        priorTurns: [{ marker: 'first', reply: 'SMOKE_token' }],
    };
    const current = {
        session: 'local-session',
        prompts: ['First [smoke:first]', 'Follow up [smoke:second]'],
        responses: [
            { text: '\nSMOKE_token ', completed: true },
            { text: ' SMOKE_token\n', completed: true },
        ],
        requests: [],
    };
    assert.equal(
        turnCompleted(before, current, 'second', 'SMOKE_token', 'real'),
        true,
    );
    for (const invalid of [
        { ...current, session: 'other' },
        { ...current, prompts: ['First [smoke:first]', 'Stale [smoke:first]'] },
        { ...current, responses: [current.responses[1]] },
        { ...current, responses: [...current.responses, current.responses[1]] },
        {
            ...current,
            responses: [
                current.responses[0],
                { text: 'SMOKE_token', completed: false },
            ],
        },
        {
            ...current,
            responses: [current.responses[0], { text: '', completed: true }],
        },
        {
            ...current,
            responses: [
                current.responses[0],
                { text: '`SMOKE_token`', completed: true },
            ],
        },
        {
            ...current,
            responses: [
                current.responses[0],
                { text: 'Here: SMOKE_token', completed: true },
            ],
        },
        {
            ...current,
            responses: [
                { text: 'changed', completed: true },
                current.responses[1],
            ],
        },
    ])
        assert.equal(
            turnCompleted(before, invalid, 'second', 'SMOKE_token', 'real'),
            false,
        );
    assert.equal(
        turnCompleted(before, current, 'second', 'SMOKE_token'),
        false,
    );
});
