import { randomUUID } from 'node:crypto';
import { inArray } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TurnResult } from './agent/nexo-agent.js';
import { buildApp, type TurnRunner } from './app.js';
import { createConversationStore } from './conversations.js';
import { createDb } from './db/client.js';
import { conversations, messages } from './db/schema.js';
import { TicketsApiError, type TicketsClient } from './tickets/client.js';
import type { Employee } from './tickets/types.js';

const person = (name: string, role: Employee['role'] = 'funcionario'): Employee => ({
  id: randomUUID(),
  email: `${name.toLowerCase().replace(' ', '.')}.${randomUUID().slice(0, 6)}@nexo.com.br`,
  name,
  department: role === 'analista' ? 'TI' : 'Financeiro',
  role,
  team: role === 'analista' ? 'Suporte N1' : null,
});

const ana = person('Ana Teste');
const carla = person('Carla Teste');
const rafael = person('Rafael Teste', 'analista');
const people = [ana, carla, rafael];

const tickets = {
  findEmployeeByEmail: vi.fn(async (email: string) => {
    const found = people.find((p) => p.email === email);
    if (!found) throw new TicketsApiError(404, 'not_found', 'Funcionário não encontrado');
    return found;
  }),
  listTickets: vi.fn(async () => []),
} as unknown as TicketsClient;

const runTurn = vi.fn<TurnRunner>();
const { db, pool } = createDb(process.env.ASSIST_DATABASE_URL!);
const app = buildApp({ store: createConversationStore(db), tickets, runTurn, sessionSecret: 'segredo-de-teste-123456', webOrigin: 'http://localhost:3100' });

const reply = (over: Partial<TurnResult> = {}): TurnResult => ({
  reply: 'Encontrei seu chamado.',
  blocks: [],
  state: { turn: 1, draft: null, handoff: null },
  trace: { model: 'teste', decision: { intent: 'consultar', action: 'listar', confidence: 0.9, reason: 'pediu status' }, steps: [], guardrails: [], usage: null, durationMs: 1 },
  ...over,
});

async function login(who: Employee) {
  const res = await app.inject({ method: 'POST', url: '/auth/login', payload: { email: who.email, password: 'qualquer' } });
  return { authorization: `Bearer ${res.json().token as string}` };
}

async function newConversation(headers: Record<string, string>) {
  const res = await app.inject({ method: 'POST', url: '/conversations', headers });
  return res.json().id as string;
}

const say = (id: string, headers: Record<string, string>, content: string) => app.inject({ method: 'POST', url: `/conversations/${id}/messages`, headers, payload: { content } });

beforeEach(() => {
  runTurn.mockReset();
});

afterAll(async () => {
  const ids = (await db.select({ id: conversations.id }).from(conversations).where(inArray(conversations.employeeId, people.map((p) => p.id)))).map((c) => c.id);
  if (ids.length) {
    await db.delete(messages).where(inArray(messages.conversationId, ids));
    await db.delete(conversations).where(inArray(conversations.id, ids));
  }
  await app.close();
  await pool.end();
});

describe('login e sessão', () => {
  it('aceita funcionário da Nexo com qualquer senha', async () => {
    const res = await app.inject({ method: 'POST', url: '/auth/login', payload: { email: ana.email, password: 'x' } });
    expect(res.statusCode).toBe(200);
    expect(res.json().user.name).toBe('Ana Teste');
  });

  it('recusa e-mail desconhecido e requisição sem sessão', async () => {
    const bad = await app.inject({ method: 'POST', url: '/auth/login', payload: { email: 'ninguem@nexo.com.br', password: 'x' } });
    expect(bad.statusCode).toBe(401);
    const noToken = await app.inject({ method: 'GET', url: '/conversations' });
    expect(noToken.statusCode).toBe(401);
  });

  it('não deixa um funcionário ver a conversa de outro', async () => {
    const id = await newConversation(await login(ana));
    const res = await app.inject({ method: 'GET', url: `/conversations/${id}`, headers: await login(carla) });
    expect(res.statusCode).toBe(404);
  });
});

describe('mensagens', () => {
  it('transmite a resposta em tempo real e salva conversa, trace e estado', async () => {
    const headers = await login(ana);
    const id = await newConversation(headers);
    runTurn.mockImplementation(async ({ onText }) => {
      onText('Encontrei ');
      onText('seu chamado.');
      return reply();
    });

    const res = await say(id, headers, 'como está meu chamado?');

    expect(res.headers['content-type']).toContain('text/event-stream');
    expect(res.body).toContain('event: text');
    expect(res.body).toContain('event: done');
    const saved = (await app.inject({ method: 'GET', url: `/conversations/${id}`, headers })).json();
    expect(saved.messages.map((m: { role: string }) => m.role)).toEqual(['funcionario', 'agent']);
    expect(saved.messages[1].trace.decision.intent).toBe('consultar');
    expect(saved.conversation.title).toBe('como está meu chamado?');
  });

  it('manda o histórico anterior para o agent', async () => {
    const headers = await login(ana);
    const id = await newConversation(headers);
    runTurn.mockResolvedValue(reply());
    await say(id, headers, 'primeira');
    await say(id, headers, 'segunda');
    expect(runTurn.mock.calls[1]![0].history).toEqual([
      { role: 'user', content: 'primeira' },
      { role: 'assistant', content: 'Encontrei seu chamado.' },
    ]);
    expect(runTurn.mock.calls[1]![0].state.turn).toBe(1);
  });

  it('depois da transferência o agent não é chamado', async () => {
    const headers = await login(ana);
    const id = await newConversation(headers);
    runTurn.mockResolvedValue(reply({ state: { turn: 1, draft: null, handoff: { reason: 'pedido', summary: 'quer falar com alguém', ticketCode: null, at: '' } } }));
    await say(id, headers, 'quero falar com uma pessoa');

    const conv = (await app.inject({ method: 'GET', url: `/conversations/${id}`, headers })).json().conversation;
    expect(conv.status).toBe('aguardando_analista');

    await say(id, headers, 'alô?');
    expect(runTurn).toHaveBeenCalledTimes(1);
  });

  it('avisa o funcionário quando o agent falha, sem perder a mensagem dele', async () => {
    const headers = await login(ana);
    const id = await newConversation(headers);
    runTurn.mockRejectedValue(new Error('openai fora'));
    const res = await say(id, headers, 'oi');
    expect(res.body).toContain('event: error');
    const saved = (await app.inject({ method: 'GET', url: `/conversations/${id}`, headers })).json();
    expect(saved.messages).toHaveLength(1);
  });
});

describe('limites de uso', () => {
  it('recusa mensagens em excesso e para de chamar o modelo no limite diário', async () => {
    const limited = buildApp({
      store: createConversationStore(db),
      tickets,
      runTurn,
      sessionSecret: 'segredo-de-teste-123456',
      webOrigin: 'http://localhost:3100',
      limits: { requestsPerMinute: 100, messagesPerMinute: 2, agentRepliesPerDay: 1 },
    });
    const headers = await login(ana);
    const id = (await limited.inject({ method: 'POST', url: '/conversations', headers })).json().id as string;
    runTurn.mockResolvedValue(reply());
    const post = (content: string) => limited.inject({ method: 'POST', url: `/conversations/${id}/messages`, headers, payload: { content } });

    await post('primeira');
    const second = await post('segunda');
    const third = await post('terceira');

    expect(runTurn.mock.calls.length).toBeLessThanOrEqual(1);
    expect(second.body).toContain('limite diário');
    expect(third.statusCode).toBe(429);
    await limited.close();
  });
});

describe('console do analista', () => {
  it('é restrito a analistas', async () => {
    const res = await app.inject({ method: 'GET', url: '/console/conversations', headers: await login(ana) });
    expect(res.statusCode).toBe(403);
  });

  it('lista as conversas com a última mensagem de cada uma', async () => {
    const employee = await login(carla);
    const id = await newConversation(employee);
    runTurn.mockResolvedValue(reply({ reply: 'Achei o artigo da VPN.' }));
    await say(id, employee, 'vpn caiu');
    const list = (await app.inject({ method: 'GET', url: '/console/conversations', headers: await login(rafael) })).json();
    const item = list.find((c: { id: string }) => c.id === id);
    expect(item.lastMessage).toMatchObject({ role: 'agent', content: 'Achei o artigo da VPN.' });
  });

  it('assume, responde e devolve a conversa ao agent', async () => {
    const employee = await login(ana);
    const analyst = await login(rafael);
    const id = await newConversation(employee);

    const assumed = (await app.inject({ method: 'POST', url: `/console/conversations/${id}/assume`, headers: analyst })).json();
    expect(assumed.conversation).toMatchObject({ status: 'com_analista', analystName: 'Rafael Teste' });

    await say(id, employee, 'oi, Rafael');
    expect(runTurn).not.toHaveBeenCalled();

    await app.inject({ method: 'POST', url: `/console/conversations/${id}/messages`, headers: analyst, payload: { content: 'Já resolvi, pode testar.' } });
    const released = (await app.inject({ method: 'POST', url: `/console/conversations/${id}/release`, headers: analyst })).json();
    expect(released.conversation).toMatchObject({ status: 'agent', handoff: null });
    expect(released.messages.map((m: { role: string }) => m.role)).toEqual(['sistema', 'funcionario', 'analista', 'sistema']);

    runTurn.mockResolvedValue(reply());
    await say(id, employee, 'funcionou, obrigado');
    expect(runTurn).toHaveBeenCalledTimes(1);
    expect(runTurn.mock.calls[0]![0].history).toContainEqual({ role: 'assistant', content: '[Analista Rafael Teste] Já resolvi, pode testar.' });
  });

  it('não deixa responder sem assumir nem mexer em conversa encerrada', async () => {
    const analyst = await login(rafael);
    const id = await newConversation(await login(ana));
    const early = await app.inject({ method: 'POST', url: `/console/conversations/${id}/messages`, headers: analyst, payload: { content: 'oi' } });
    expect(early.statusCode).toBe(409);
    await app.inject({ method: 'POST', url: `/console/conversations/${id}/close`, headers: analyst });
    const after = await app.inject({ method: 'POST', url: `/console/conversations/${id}/assume`, headers: analyst });
    expect(after.statusCode).toBe(409);
  });
});
