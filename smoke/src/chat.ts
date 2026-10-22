import { randomUUID } from 'node:crypto';
import type { ChatBackend } from './arguments.js';
import type { ChatTurn } from './turn.js';

export interface SubmittedTurn extends ChatTurn { prompt: string }

export function chatTurns(backend: ChatBackend, foundation = false): SubmittedTurn[] {
  const marker = randomUUID();
  const token = `SMOKE_${randomUUID()}`;
  if (backend === 'real') return [
    { marker, reply: token, prompt: `Reply with exactly this token and nothing else: \`${token}\`. Do not use tools. [smoke:${marker}]` },
    { marker: randomUUID(), reply: token, prompt: 'Repeat the token from your previous answer exactly, and nothing else. Do not use tools.' },
  ].map((turn, index) => index === 0 ? turn : { ...turn, prompt: `${turn.prompt} [smoke:${turn.marker}]` });
  const first = { marker, reply: `${foundation ? 'MOCK_FOUNDATION' : 'MOCK_CHAT_FIRST'}_${marker}`,
    prompt: `Reply briefly without tools or edits. [smoke:${marker}]` };
  const next = randomUUID();
  return [first, ...(foundation ? [] : [{ marker: next, reply: `MOCK_CHAT_FOLLOWUP_${randomUUID()}`,
    prompt: `Follow up: Reply briefly without tools or edits. [smoke:${next}]` }])];
}

export type ChatOutcome = 'blocked' | 'failed' | 'harness_error';
export interface ChatEvidence {
  session: string;
  turns: { marker: string; prompt: string; reply: string; observedReply?: string; completed: boolean;
    responseCount: number; requestSequence?: number; durationMs: number }[];
}

export class ChatFailure extends Error {
  observedReplies?: string[];
  constructor(readonly outcome: ChatOutcome, message: string, public evidence?: ChatEvidence) { super(message); }
}

export function uiIssue(messages: string[]): ChatFailure | undefined {
  if (!messages.length) return undefined;
  const text = messages.join('\n');
  const prerequisite = /sign(?:ed)?[ -]?in|log(?:ged)?[ -]?in|authenticat(?:ion)? (?:required|expired|failed)|not authenticat|re-?authenticat|unauthorized|\b401\b|token.*expir|expir.*token|(?:subscription|licen[cs]e).*(?:required|expired|ended|inactive)|do not have access|not entitled|entitlement|quota|reached.*(?:chat|request|usage|premium).*limit|(?:chat|premium).*limit.*reached/i;
  if (prerequisite.test(text)) return new ChatFailure('blocked',
    'Copilot authentication, entitlement or quota prerequisite unavailable. Rerun npm --prefix smoke run setup:real-chat -- --build <app>, resolve access/quota, close setup, and rerun.');
  return new ChatFailure('failed', 'Copilot Chat displayed an error or warning; the response cannot pass.');
}

// The pinned build's Export Chat command exposes the terminal model state and raw
// Markdown. DOM text alone cannot distinguish `TOKEN` from TOKEN, or cancellation.
export function verifyExport(data: unknown, turns: readonly SubmittedTurn[]): string[] {
  const object = (value: unknown): Record<string, unknown> | undefined =>
    value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
  const requests = object(data)?.requests;
  if (!Array.isArray(requests)) throw new ChatFailure('harness_error', 'Unsupported Chat export schema');
  if (requests.length !== turns.length) throw new ChatFailure('failed', 'Exported Chat transcript count changed');
  const observed: string[] = [];
  for (const [index, turn] of turns.entries()) {
    const request = object(requests[index]);
    const message = request?.message;
    const prompt = typeof message === 'string' ? message : object(message)?.text;
    if (typeof prompt !== 'string' || prompt !== turn.prompt || !prompt.includes(`[smoke:${turn.marker}]`)) {
      throw new ChatFailure('failed', 'Exported Chat transcript does not match the current turn markers');
    }
    if (!Array.isArray(request?.response)) throw new ChatFailure('harness_error', 'Unsupported Chat response schema');
    const markdown = request.response.map(part => object(part)?.value);
    const text = markdown.filter((part): part is string => typeof part === 'string').join('');
    observed.push(text);
    const fail = (outcome: ChatOutcome, reason: string): never => {
      const failure = new ChatFailure(outcome, reason);
      failure.observedReplies = observed;
      throw failure;
    };
    const details = object(object(request.result)?.errorDetails);
    if (details) {
      const issue = details.isQuotaExceeded ? uiIssue(['quota exceeded'])! : uiIssue([typeof details.message === 'string' ? details.message : 'Chat error'])!;
      fail(issue.outcome, issue.message);
    }
    const state = object(request.modelState)?.value;
    if (typeof state !== 'number' || ![0, 1, 2, 3, 4].includes(state)) fail('harness_error', 'Unsupported Chat completion state');
    if (state !== 1 || request.isCanceled === true) fail('failed', 'Chat response was cancelled, incomplete or failed');
    if (markdown.some(part => typeof part !== 'string') || !text.trim() || text.trim() !== turn.reply) {
      fail('failed', 'Chat response did not match the exact expected token');
    }
  }
  return observed;
}
