import cors from '@fastify/cors';
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { ChatMessage, TurnResult } from './agent/nexo-agent.js';
import type { ConversationState } from './agent/state.js';
import { createSessionToken, readSessionToken, type SessionUser } from './auth.js';
import { ConflictError, NotFoundError, toChatHistory, toConversationDto, toMessageDto, type ConversationStore } from './conversations.js';
import { CONVERSATION_STATUSES, type ConversationRow } from './db/schema.js';
import { TicketsApiError, type TicketsClient } from './tickets/client.js';

export type TurnRunner = (input: {
  employee: SessionUser;
  state: ConversationState;
  history: ChatMessage[];
  message: string;
  onText: (delta: string) => void;
}) => Promise<TurnResult>;

export type AppOptions = {
  store: ConversationStore;
  tickets: TicketsClient;
  runTurn: TurnRunner;
  sessionSecret: string;
  webOrigin: string;
  logger?: boolean;
};

class UnauthorizedError extends Error {}
class ForbiddenError extends Error {}

const idParams = z.object({ id: z.string().uuid() });
const messageBody = z.object({ content: z.string().trim().min(1).max(2000) });

export function buildApp({ store, tickets, runTurn, sessionSecret, webOrigin, logger = false }: AppOptions): FastifyInstance {
  const app = Fastify({ logger });
  app.register(cors, { origin: webOrigin, methods: ['GET', 'POST'] });

  function userOf(req: FastifyRequest): SessionUser {
    const header = req.headers.authorization ?? '';
    const user = header.startsWith('Bearer ') ? readSessionToken(header.slice(7), sessionSecret) : null;
    if (!user) throw new UnauthorizedError('Sessão inválida ou expirada');
    return user;
  }

  function analystOf(req: FastifyRequest): SessionUser {
    const user = userOf(req);
    if (user.role !== 'analista') throw new ForbiddenError('Acesso restrito aos analistas do service desk');
    return user;
  }

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof z.ZodError) return reply.code(400).send({ error: 'validation', message: 'Dados inválidos', issues: err.issues });
    if (err instanceof UnauthorizedError) return reply.code(401).send({ error: 'unauthorized', message: err.message });
    if (err instanceof ForbiddenError) return reply.code(403).send({ error: 'forbidden', message: err.message });
    if (err instanceof NotFoundError) return reply.code(404).send({ error: 'not_found', message: err.message });
    if (err instanceof ConflictError) return reply.code(409).send({ error: 'conflict', message: err.message });
    if (err instanceof TicketsApiError) {
      if (err.status === 404) return reply.code(404).send({ error: 'not_found', message: err.message });
      return reply.code(503).send({ error: 'unavailable', message: 'Sistema de chamados indisponível. Tente de novo em instantes.' });
    }
    req.log.error(err);
    return reply.code(500).send({ error: 'internal', message: 'Erro interno no Nexo Assist' });
  });

  app.get('/health', async () => ({ ok: true }));

  app.post('/auth/login', async (req, reply) => {
    const { email } = z.object({ email: z.string().email(), password: z.string().min(1) }).parse(req.body);
    const employee = await tickets.findEmployeeByEmail(email).catch((err: unknown) => {
      if (err instanceof TicketsApiError && err.status === 404) return null;
      throw err;
    });
    if (!employee) return reply.code(401).send({ error: 'unauthorized', message: 'E-mail não encontrado na Nexo' });
    const user: SessionUser = { id: employee.id, email: employee.email, name: employee.name, department: employee.department, role: employee.role, team: employee.team };
    return { token: createSessionToken(user, sessionSecret), user };
  });

  app.get('/me', async (req) => userOf(req));

  app.get('/conversations', async (req) => {
    const user = userOf(req);
    return (await store.listByEmployee(user.id)).map(toConversationDto);
  });

  app.post('/conversations', async (req, reply) => {
    const user = userOf(req);
    return reply.code(201).send(toConversationDto(await store.create(user)));
  });

  app.get('/conversations/:id', async (req) => {
    const user = userOf(req);
    const { id } = idParams.parse(req.params);
    const conversation = await store.getOwned(id, user.id);
    const rows = await store.messagesOf(id);
    return { conversation: toConversationDto(conversation), messages: rows.map(toMessageDto) };
  });

  app.get('/tickets', async (req) => {
    const user = userOf(req);
    return tickets.listTickets(user.id, 'all');
  });

  app.post('/conversations/:id/messages', async (req, reply) => {
    const user = userOf(req);
    const { id } = idParams.parse(req.params);
    const { content } = messageBody.parse(req.body);
    const conversation = await store.getOwned(id, user.id);
    if (conversation.status === 'encerrada') throw new ConflictError('Esta conversa foi encerrada. Comece uma nova.');

    const previous = await store.messagesOf(id);
    const userMessage = await store.addMessage(id, { role: 'funcionario', authorName: user.name, content });
    if (!conversation.title) await store.update(id, { title: content.slice(0, 80) });

    reply.hijack();
    reply.raw.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'access-control-allow-origin': webOrigin,
    });
    const send = (event: string, data: unknown) => reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    send('user', toMessageDto(userMessage));

    try {
      if (conversation.status !== 'agent') {
        send('done', { message: null, conversation: toConversationDto(await store.get(id)) });
        return;
      }
      const result = await runTurn({ employee: user, state: conversation.state, history: toChatHistory(previous), message: content, onText: (delta) => send('text', { delta }) });
      const agentMessage = await store.addMessage(id, { role: 'agent', authorName: 'Nexo Assist', content: result.reply, blocks: result.blocks, trace: result.trace });
      const updated = await store.update(id, { state: result.state, status: result.state.handoff ? 'aguardando_analista' : 'agent' });
      send('done', { message: toMessageDto(agentMessage), conversation: toConversationDto(updated) });
    } catch (err) {
      req.log.error(err);
      send('error', { message: 'O Nexo Assist não conseguiu responder agora. Tente de novo em instantes.' });
    } finally {
      reply.raw.end();
    }
  });

  async function consoleView(conversation: ConversationRow) {
    const [rows, employeeTickets] = await Promise.all([store.messagesOf(conversation.id), tickets.listTickets(conversation.employeeId, 'all').catch(() => null)]);
    return { conversation: toConversationDto(conversation), messages: rows.map(toMessageDto), tickets: employeeTickets };
  }

  app.get('/console/conversations', async (req) => {
    analystOf(req);
    const { status } = z.object({ status: z.enum(CONVERSATION_STATUSES).optional() }).parse(req.query);
    const rows = await store.listForConsole(status ? [status] : undefined);
    const last = await store.lastMessages(rows.map((r) => r.id));
    return rows.map((r) => {
      const m = last.get(r.id);
      return { ...toConversationDto(r), lastMessage: m ? { role: m.role, authorName: m.authorName, content: m.content, createdAt: m.createdAt.toISOString() } : null };
    });
  });

  app.get('/console/conversations/:id', async (req) => {
    analystOf(req);
    const { id } = idParams.parse(req.params);
    return consoleView(await store.get(id));
  });

  app.post('/console/conversations/:id/assume', async (req) => {
    const analyst = analystOf(req);
    const { id } = idParams.parse(req.params);
    const conversation = await store.get(id);
    if (conversation.status === 'encerrada') throw new ConflictError('Conversa encerrada');
    if (conversation.status === 'com_analista' && conversation.analystName !== analyst.name) throw new ConflictError(`${conversation.analystName} já está atendendo esta conversa`);
    const state: ConversationState = conversation.state.handoff
      ? conversation.state
      : { ...conversation.state, handoff: { reason: 'pedido', summary: 'Analista assumiu a conversa pelo console.', ticketCode: null, at: new Date().toISOString() } };
    await store.addMessage(id, { role: 'sistema', authorName: 'Sistema', content: `${analyst.name} assumiu o atendimento. O Nexo Assist está pausado.` });
    return consoleView(await store.update(id, { status: 'com_analista', analystName: analyst.name, state }));
  });

  app.post('/console/conversations/:id/messages', async (req) => {
    const analyst = analystOf(req);
    const { id } = idParams.parse(req.params);
    const { content } = messageBody.parse(req.body);
    const conversation = await store.get(id);
    if (conversation.status !== 'com_analista') throw new ConflictError('Assuma a conversa antes de responder');
    await store.addMessage(id, { role: 'analista', authorName: analyst.name, content });
    return consoleView(await store.get(id));
  });

  app.post('/console/conversations/:id/release', async (req) => {
    const analyst = analystOf(req);
    const { id } = idParams.parse(req.params);
    const conversation = await store.get(id);
    if (conversation.status === 'encerrada') throw new ConflictError('Conversa encerrada');
    await store.addMessage(id, { role: 'sistema', authorName: 'Sistema', content: `${analyst.name} devolveu a conversa ao Nexo Assist.` });
    return consoleView(await store.update(id, { status: 'agent', analystName: null, state: { ...conversation.state, handoff: null } }));
  });

  app.post('/console/conversations/:id/close', async (req) => {
    const analyst = analystOf(req);
    const { id } = idParams.parse(req.params);
    await store.get(id);
    await store.addMessage(id, { role: 'sistema', authorName: 'Sistema', content: `Atendimento encerrado por ${analyst.name}.` });
    return consoleView(await store.update(id, { status: 'encerrada' }));
  });

  return app;
}
