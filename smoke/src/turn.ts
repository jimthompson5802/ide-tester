import type { MockRequest } from './mock.js';

export interface ChatTurn { marker: string; reply: string }
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

export function turnCompleted(before: TurnBaseline, current: TurnSnapshot, marker: string, expected: string): boolean {
  if (!before.session || current.session !== before.session || current.responses.length !== before.responseCount + 1) return false;
  if (current.prompts.length !== before.responseCount + 1) return false;
  if (before.priorTurns) {
    if (before.priorTurns.length !== before.responseCount) return false;
    for (const [index, previous] of before.priorTurns.entries()) {
      if (!current.prompts[index].includes(`[smoke:${previous.marker}]`) ||
        !current.responses[index].completed || current.responses[index].text !== previous.reply) return false;
    }
  }
  if (!current.prompts.at(-1)?.includes(`[smoke:${marker}]`)) return false;
  const bubble = current.responses.at(-1);
  const request = current.requests.at(-1);
  return !!bubble && bubble.completed && bubble.text === expected && !!request &&
    request.sequence > before.requestSequence && request.marker === marker && request.completed && request.reply === expected;
}
