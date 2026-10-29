import type { ToolExecutionContext } from '@mastra/core/tools';
import { createTicketsClient, type TicketsClient } from '../tickets/client.js';
import type { Employee } from '../tickets/types.js';
import type { ConversationState, DecisionReport, TraceStep, UiBlock } from './state.js';

export type TurnContext = {
  employee: Employee;
  state: ConversationState;
  tickets: TicketsClient;
  steps: TraceStep[];
  guardrails: string[];
  blocks: UiBlock[];
  decision: DecisionReport | null;
  pendingRetries: number;
};

export function createTurnContext(opts: {
  employee: Employee;
  state: ConversationState;
  ticketsUrl: string;
  ticketsToken: string;
  tickets?: TicketsClient;
}): TurnContext {
  const turn: TurnContext = {
    employee: opts.employee,
    state: opts.state,
    steps: [],
    guardrails: [],
    blocks: [],
    decision: null,
    pendingRetries: 0,
    tickets: undefined as unknown as TicketsClient,
  };
  turn.tickets =
    opts.tickets ??
    createTicketsClient({
      baseUrl: opts.ticketsUrl,
      token: opts.ticketsToken,
      onRetry: () => {
        turn.pendingRetries++;
      },
    });
  return turn;
}

export const TURN_KEY = 'turn';

export function turnFrom(ctx: Pick<ToolExecutionContext, 'requestContext'> | undefined): TurnContext {
  const turn = (ctx?.requestContext as { get(key: string): unknown } | undefined)?.get(TURN_KEY) as TurnContext | undefined;
  if (!turn) throw new Error('Tool chamada fora de um turno do Nexo Assist');
  return turn;
}
