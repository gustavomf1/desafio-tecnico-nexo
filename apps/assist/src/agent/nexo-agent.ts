import { Agent } from '@mastra/core/agent';
import { RequestContext } from '@mastra/core/request-context';
import type { TicketsClient } from '../tickets/client.js';
import type { Employee } from '../tickets/types.js';
import { buildInstructions } from './instructions.js';
import type { ConversationState, DecisionTrace, UiBlock } from './state.js';
import { nexoTools } from './tools.js';
import { TURN_KEY, createTurnContext, turnFrom } from './turn-context.js';

export const MAX_USER_MESSAGES = 30;
export const HISTORY_WINDOW = 12;
export const LOW_CONFIDENCE = 0.5;

export type ChatMessage = { role: 'user'; content: string } | { role: 'assistant'; content: string };

export function createNexoAgent(model: string) {
  return new Agent({
    id: 'nexo-assist',
    name: 'Nexo Assist',
    instructions: ({ requestContext }) => buildInstructions(turnFrom({ requestContext })),
    model,
    tools: nexoTools,
  });
}

export type NexoAgent = ReturnType<typeof createNexoAgent>;

export type TurnInput = {
  agent: NexoAgent;
  model: string;
  employee: Employee;
  state: ConversationState;
  history: ChatMessage[];
  message: string;
  ticketsUrl: string;
  ticketsToken: string;
  tickets?: TicketsClient;
  onText?: (delta: string) => void;
};

export type TurnResult = {
  reply: string;
  blocks: UiBlock[];
  trace: DecisionTrace;
  state: ConversationState;
};

const emptyTrace = (model: string, guardrail: string): DecisionTrace => ({ model, decision: null, steps: [], guardrails: [guardrail], usage: null, durationMs: 0 });

export async function runTurn(input: TurnInput): Promise<TurnResult> {
  const started = Date.now();
  const state: ConversationState = structuredClone(input.state);

  if (state.handoff) {
    return { reply: '', blocks: [], trace: emptyTrace(input.model, 'Conversa com um analista: o agent está pausado.'), state };
  }
  if (state.turn >= MAX_USER_MESSAGES) {
    const reply = `Esta conversa chegou ao limite de ${MAX_USER_MESSAGES} mensagens. Comece uma nova conversa para continuar; seus chamados continuam salvos.`;
    input.onText?.(reply);
    return { reply, blocks: [], trace: emptyTrace(input.model, `Limite de ${MAX_USER_MESSAGES} mensagens por sessão atingido.`), state };
  }

  state.turn += 1;
  const turn = createTurnContext({ employee: input.employee, state, ticketsUrl: input.ticketsUrl, ticketsToken: input.ticketsToken, tickets: input.tickets });
  const requestContext = new RequestContext();
  requestContext.set(TURN_KEY, turn);

  const messages = [...input.history.slice(-HISTORY_WINDOW), { role: 'user' as const, content: input.message }];
  const stream = await input.agent.stream(messages, { requestContext, maxSteps: 6, modelSettings: { temperature: 0.2, timeout: { totalMs: 45_000, stepMs: 20_000 } } });

  let reply = '';
  for await (const chunk of stream.fullStream) {
    if (chunk.type === 'text-start' && reply.trim() && !/\s$/.test(reply)) {
      reply += '\n\n';
      input.onText?.('\n\n');
    }
    if (chunk.type === 'text-delta') {
      reply += chunk.payload.text;
      input.onText?.(chunk.payload.text);
    }
  }
  const usage = await stream.usage;

  if (!turn.decision) {
    turn.guardrails.push('O modelo não registrou a decisão nesta resposta; o trace mostra só as ações executadas.');
  } else if (turn.decision.confidence < LOW_CONFIDENCE && !state.handoff) {
    state.handoff = {
      reason: 'incerteza',
      summary: `O agent não teve segurança para decidir (${turn.decision.confidence.toFixed(2)}). Pedido: "${input.message}". Entendimento: ${turn.decision.intent}.`,
      ticketCode: null,
      at: new Date().toISOString(),
    };
    turn.blocks.push({ type: 'handoff', handoff: state.handoff });
    turn.guardrails.push(`Confiança ${turn.decision.confidence.toFixed(2)} abaixo de ${LOW_CONFIDENCE}: conversa transferida para um analista.`);
    const notice = '\n\nComo não tenho segurança sobre o melhor caminho, vou chamar um analista para te ajudar.';
    reply += notice;
    input.onText?.(notice);
  }

  return {
    reply: reply.trim(),
    blocks: turn.blocks,
    state,
    trace: {
      model: input.model,
      decision: turn.decision,
      steps: turn.steps,
      guardrails: turn.guardrails,
      usage: { inputTokens: usage.inputTokens ?? 0, outputTokens: usage.outputTokens ?? 0 },
      durationMs: Date.now() - started,
    },
  };
}
