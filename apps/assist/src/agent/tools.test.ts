import { RequestContext } from '@mastra/core/request-context';
import { describe, expect, it, vi } from 'vitest';
import type { TicketsClient } from '../tickets/client.js';
import type { Employee, Ticket } from '../tickets/types.js';
import { MAX_USER_MESSAGES, runTurn, type NexoAgent } from './nexo-agent.js';
import { initialState, type ConversationState } from './state.js';
import { confirmarRascunho, prepararChamado, prepararComplemento } from './tools.js';
import { TURN_KEY, createTurnContext, type TurnContext } from './turn-context.js';

const ana: Employee = { id: 'emp-ana', email: 'ana.souza@nexo.com.br', name: 'Ana Souza', department: 'Financeiro', role: 'funcionario', team: null };

function ticket(over: Partial<Ticket> = {}): Ticket {
  return {
    code: 'INC-20311',
    type: 'INC',
    category: 'Hardware',
    subcategory: null,
    priority: 'media',
    status: 'aberto',
    title: 'Notebook lento após atualização do Windows',
    description: 'Lento desde a atualização',
    affected: 'Ana Souza',
    createdAt: '2026-10-20T12:00:00.000Z',
    updatedAt: '2026-10-20T12:00:00.000Z',
    resolvedAt: null,
    sla: { dueAt: '2026-10-23T12:00:00.000Z', overdue: false, rule: '3 dias úteis' },
    reopenable: false,
    ...over,
  };
}

function fakeTickets(over: Partial<TicketsClient> = {}): TicketsClient {
  return {
    findEmployeeByEmail: vi.fn(),
    getEmployee: vi.fn(),
    listTickets: vi.fn(async () => []),
    getTicket: vi.fn(async () => ({ ...ticket(), updates: [] })),
    findSimilar: vi.fn(async () => []),
    createTicket: vi.fn(async (_id, input) => ticket({ ...input, code: 'INC-20520' })),
    addUpdate: vi.fn(async () => ticket()),
    reopen: vi.fn(async () => ticket({ status: 'aberto' })),
    escalate: vi.fn(async () => ticket({ status: 'aguardando_analista' })),
    searchArticles: vi.fn(async () => []),
    ...over,
  } as TicketsClient;
}

function turnWith(tickets: TicketsClient, state: ConversationState = { ...initialState(), turn: 1 }): { turn: TurnContext; ctx: { requestContext: RequestContext } } {
  const turn = createTurnContext({ employee: ana, state, ticketsUrl: 'http://x', ticketsToken: 't', tickets });
  const requestContext = new RequestContext();
  requestContext.set(TURN_KEY, turn);
  return { turn, ctx: { requestContext } };
}

const newTicket = {
  type: 'INC' as const,
  category: 'Rede e VPN' as const,
  priority: 'alta' as const,
  priorityReason: 'Impede a pessoa de trabalhar',
  title: 'VPN com erro 809 no Windows 11',
  description: 'Desde hoje cedo a VPN dá erro 809 e não conecta.',
  affected: 'Ana Souza',
  ignorarDuplicado: false,
};

const exec = (tool: { execute?: unknown }, input: unknown, ctx: unknown) => (tool.execute as (i: unknown, c: unknown) => Promise<unknown>)(input, ctx);

describe('tools do Nexo Assist', () => {
  it('usa o funcionário da sessão, nunca um id vindo do modelo', async () => {
    const tickets = fakeTickets();
    const { ctx } = turnWith(tickets);
    await exec(prepararChamado, newTicket, ctx);
    expect(tickets.findSimilar).toHaveBeenCalledWith('emp-ana', newTicket.title, newTicket.category);
  });

  it('não executa o rascunho na mesma mensagem em que ele foi preparado', async () => {
    const tickets = fakeTickets();
    const { turn, ctx } = turnWith(tickets);
    const draft = (await exec(prepararChamado, newTicket, ctx)) as { draftId: string };

    const result = await exec(confirmarRascunho, { draftId: draft.draftId }, ctx);

    expect(result).toMatchObject({ ok: false });
    expect(tickets.createTicket).not.toHaveBeenCalled();
    expect(turn.guardrails.join(' ')).toContain('antes do funcionário confirmar');
  });

  it('cria o chamado quando a confirmação vem na mensagem seguinte', async () => {
    const tickets = fakeTickets();
    const first = turnWith(tickets);
    const draft = (await exec(prepararChamado, newTicket, first.ctx)) as { draftId: string };

    const second = turnWith(tickets, { ...first.turn.state, turn: 2 });
    const result = await exec(confirmarRascunho, { draftId: draft.draftId }, second.ctx);

    expect(result).toMatchObject({ ok: true, chamado: { code: 'INC-20520' } });
    expect(tickets.createTicket).toHaveBeenCalledWith('emp-ana', expect.objectContaining({ title: newTicket.title }));
    expect(second.turn.state.draft).toBeNull();
  });

  it('vira atualização quando já existe chamado aberto sobre o mesmo problema', async () => {
    const existing = ticket({ code: 'INC-20388', title: 'VPN caindo a cada 10 minutos', category: 'Rede e VPN' });
    const tickets = fakeTickets({ findSimilar: vi.fn(async () => [{ ticket: existing, score: 0.8 }]) });
    const { turn, ctx } = turnWith(tickets);

    const result = await exec(prepararChamado, newTicket, ctx);

    expect(result).toMatchObject({ duplicado: { code: 'INC-20388' } });
    expect(turn.state.draft).toMatchObject({ kind: 'update', code: 'INC-20388', duplicate: true });
  });

  it('propõe reabrir chamado resolvido há até 7 dias e recusa os mais antigos', async () => {
    const recent = fakeTickets({ getTicket: vi.fn(async () => ({ ...ticket({ status: 'resolvido', reopenable: true }), updates: [] })) });
    const a = turnWith(recent);
    await exec(prepararComplemento, { code: 'INC-20150', text: 'voltou a bloquear' }, a.ctx);
    expect(a.turn.state.draft).toMatchObject({ kind: 'reopen' });

    const old = fakeTickets({ getTicket: vi.fn(async () => ({ ...ticket({ status: 'resolvido', reopenable: false }), updates: [] })) });
    const b = turnWith(old);
    const result = await exec(prepararComplemento, { code: 'INC-19877', text: 'voltou' }, b.ctx);
    expect(result).toMatchObject({ ok: false });
    expect(b.turn.state.draft).toBeNull();
  });

  it('transfere para um analista quando o chamado criado é crítico', async () => {
    const tickets = fakeTickets();
    const first = turnWith(tickets);
    const draft = (await exec(prepararChamado, { ...newTicket, priority: 'critica' }, first.ctx)) as { draftId: string };
    const second = turnWith(tickets, { ...first.turn.state, turn: 2 });

    await exec(confirmarRascunho, { draftId: draft.draftId }, second.ctx);

    expect(second.turn.state.handoff).toMatchObject({ reason: 'critico', ticketCode: 'INC-20520' });
  });
});

describe('runTurn', () => {
  const base = { model: 'teste', employee: ana, history: [], message: 'oi', ticketsUrl: 'http://x', ticketsToken: 't' };
  const agentThatMustNotRun = { stream: vi.fn() } as unknown as NexoAgent;

  it('não chama o modelo enquanto a conversa está com um analista', async () => {
    const state = { ...initialState(), handoff: { reason: 'pedido' as const, summary: 'quer falar com alguém', ticketCode: null, at: '' } };
    const result = await runTurn({ ...base, agent: agentThatMustNotRun, state });
    expect(result.reply).toBe('');
    expect(agentThatMustNotRun.stream).not.toHaveBeenCalled();
  });

  it(`para no limite de ${MAX_USER_MESSAGES} mensagens sem chamar o modelo`, async () => {
    const result = await runTurn({ ...base, agent: agentThatMustNotRun, state: { ...initialState(), turn: MAX_USER_MESSAGES } });
    expect(result.reply).toContain('limite');
    expect(agentThatMustNotRun.stream).not.toHaveBeenCalled();
  });
});
