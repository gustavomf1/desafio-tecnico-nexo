import Fastify, { type FastifyInstance } from 'fastify';
import { z } from 'zod';
import { DomainError } from './domain/errors.js';
import { CATEGORIES, PRIORITIES, TICKET_TYPES, UPDATE_AUTHORS } from './domain/types.js';
import type { ServiceDesk } from './service-desk.js';

export type AppOptions = {
  serviceDesk: ServiceDesk;
  serviceToken: string;
  faultRate: number;
  logger?: boolean;
};

const employeeParams = z.object({ employeeId: z.string().uuid() });
const ticketParams = employeeParams.extend({ code: z.string().regex(/^(INC|REQ)-\d+$/i) });

const createTicketBody = z.object({
  type: z.enum(TICKET_TYPES),
  category: z.enum(CATEGORIES),
  subcategory: z.string().max(60).optional(),
  priority: z.enum(PRIORITIES),
  title: z.string().min(5).max(120),
  description: z.string().min(10).max(2000),
  affected: z.string().min(2).max(120),
});

const updateBody = z.object({
  author: z.enum(UPDATE_AUTHORS),
  authorName: z.string().min(1).max(80),
  body: z.string().min(1).max(2000),
});

export function buildApp({ serviceDesk, serviceToken, faultRate, logger = false }: AppOptions): FastifyInstance {
  const app = Fastify({ logger });

  // Só o backend do assistente conversa com o legado. O token nunca chega ao navegador.
  app.addHook('onRequest', async (req, reply) => {
    if (req.url === '/health') return;
    if (req.headers['x-service-token'] !== serviceToken) {
      return reply.code(401).send({ error: 'unauthorized', message: 'Token de serviço inválido' });
    }
    // O PRD diz que o sistema de chamados "de vez em quando fica indisponível por alguns segundos".
    // Simulamos isso aqui para o cliente do agent ter que lidar com a falha de verdade.
    if (Math.random() < faultRate) {
      return reply.code(503).send({ error: 'unavailable', message: 'Sistema de chamados temporariamente indisponível' });
    }
  });

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof z.ZodError) {
      return reply.code(400).send({ error: 'validation', message: 'Dados inválidos', issues: err.issues });
    }
    if (err instanceof DomainError) {
      return reply.code(err.httpStatus).send({ error: err.code, message: err.message });
    }
    req.log.error(err);
    return reply.code(500).send({ error: 'internal', message: 'Erro interno no sistema de chamados' });
  });

  app.get('/health', async () => ({ ok: true }));

  app.get('/employees', async (req) => {
    const { email } = z.object({ email: z.string().email() }).parse(req.query);
    const employee = await serviceDesk.findEmployeeByEmail(email);
    if (!employee) throw new DomainError('not_found', 'Funcionário não encontrado');
    return employee;
  });

  app.get('/employees/:employeeId', async (req) => {
    const { employeeId } = employeeParams.parse(req.params);
    return serviceDesk.getEmployee(employeeId);
  });

  app.get('/employees/:employeeId/tickets', async (req) => {
    const { employeeId } = employeeParams.parse(req.params);
    const { scope } = z.object({ scope: z.enum(['open', 'all']).default('open') }).parse(req.query);
    return serviceDesk.listTickets(employeeId, scope);
  });

  app.get('/employees/:employeeId/tickets/similar', async (req) => {
    const { employeeId } = employeeParams.parse(req.params);
    const { text, category } = z.object({ text: z.string().min(2), category: z.enum(CATEGORIES).optional() }).parse(req.query);
    return serviceDesk.findSimilar(employeeId, text, category);
  });

  app.get('/employees/:employeeId/tickets/:code', async (req) => {
    const { employeeId, code } = ticketParams.parse(req.params);
    return serviceDesk.getTicket(employeeId, code);
  });

  app.post('/employees/:employeeId/tickets', async (req, reply) => {
    const { employeeId } = employeeParams.parse(req.params);
    const ticket = await serviceDesk.createTicket(employeeId, createTicketBody.parse(req.body));
    return reply.code(201).send(ticket);
  });

  app.post('/employees/:employeeId/tickets/:code/updates', async (req) => {
    const { employeeId, code } = ticketParams.parse(req.params);
    return serviceDesk.addUpdate(employeeId, code, updateBody.parse(req.body));
  });

  app.post('/employees/:employeeId/tickets/:code/reopen', async (req) => {
    const { employeeId, code } = ticketParams.parse(req.params);
    const { reason, authorName } = z.object({ reason: z.string().min(3), authorName: z.string().min(1) }).parse(req.body);
    return serviceDesk.reopen(employeeId, code, reason, authorName);
  });

  app.post('/employees/:employeeId/tickets/:code/escalate', async (req) => {
    const { employeeId, code } = ticketParams.parse(req.params);
    const { summary } = z.object({ summary: z.string().min(10).max(2000) }).parse(req.body);
    return serviceDesk.escalate(employeeId, code, summary);
  });

  app.get('/kb/search', async (req) => {
    const { q, limit } = z.object({ q: z.string().min(2), limit: z.coerce.number().int().min(1).max(10).default(3) }).parse(req.query);
    return serviceDesk.searchArticles(q, limit);
  });

  return app;
}
