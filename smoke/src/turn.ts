import type { ChatBackend } from './arguments.js';
import type { MockRequest } from './mock.js';

export interface ChatTurn { marker: string; reply: string; prompt?: string }
export interface TurnBaseline {
  session: string; responseCount: number; requestSequence: number;
  priorTurns?: readonly ChatTurn[];
}
export interface TurnSnapshot {
  session: string;
  prompts: string[];
  responses: { text: string; completed: boolean }[];
  requests: MockRequest[];
}

export function turnCompleted(before: TurnBaseline, current: TurnSnapshot, marker: string, expected: string, backend: ChatBackend = 'mock'): boolean {
  const matches = (text: string, reply: string) => (backend === 'real' ? text.trim() : text) === reply;
  if (!before.session || current.session !== before.session || current.responses.length !== before.responseCount + 1) return false;
  if (current.prompts.length !== before.responseCount + 1) return false;
  if (before.priorTurns) {
    if (before.priorTurns.length !== before.responseCount) return false;
    for (const [index, previous] of before.priorTurns.entries()) {
      if (!current.prompts[index].includes(`[smoke:${previous.marker}]`) ||
        (previous.prompt !== undefined && !current.prompts[index].includes(previous.prompt)) ||
        !current.responses[index].completed || !matches(current.responses[index].text, previous.reply)) return false;
    }
  }
  if (!current.prompts.at(-1)?.includes(`[smoke:${marker}]`)) return false;
  const bubble = current.responses.at(-1);
  const request = current.requests.at(-1);
  return !!bubble && bubble.completed && matches(bubble.text, expected) && (backend === 'real' || (!!request &&
    request.sequence > before.requestSequence && request.marker === marker && request.completed && request.reply === expected));
}
