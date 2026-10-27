import { and, asc, desc, eq, sql } from 'drizzle-orm';
import type { Db } from './db/client.js';
import { articles, employees, incSequence, reqSequence, ticketUpdates, tickets, type ArticleRow, type EmployeeRow, type TicketRow, type TicketUpdateRow } from './db/schema.js';
import { DomainError } from './domain/errors.js';
import { slaFor, type SlaInfo } from './domain/sla.js';
import { rankByText } from './domain/text-match.js';
import { REOPEN_WINDOW_DAYS, isOpen, type Category, type Priority, type TicketType, type UpdateAuthor } from './domain/types.js';

const DAY_MS = 24 * 60 * 60 * 1000;

export type TicketDto = Omit<TicketRow, 'id' | 'requesterId' | 'createdAt' | 'updatedAt' | 'slaStartedAt' | 'resolvedAt'> & {
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  sla: SlaInfo;
  reopenable: boolean;
};

export type TicketDetailDto = TicketDto & {
  updates: Array<Pick<TicketUpdateRow, 'author' | 'authorName' | 'body'> & { createdAt: string }>;
};

export type CreateTicketInput = {
  type: TicketType;
  category: Category;
  subcategory?: string | undefined;
  priority: Priority;
  title: string;
  description: string;
  affected: string;
};

export type UpdateInput = { author: UpdateAuthor; authorName: string; body: string };

function canReopen(row: TicketRow, now: Date): boolean {
  return row.status === 'resolvido' && row.resolvedAt !== null && now.getTime() - row.resolvedAt.getTime() <= REOPEN_WINDOW_DAYS * DAY_MS;
}

function toDto(row: TicketRow, now = new Date()): TicketDto {
  const { id: _id, requesterId: _requester, slaStartedAt, createdAt, updatedAt, resolvedAt, ...rest } = row;
  return {
    ...rest,
    createdAt: createdAt.toISOString(),
    updatedAt: updatedAt.toISOString(),
    resolvedAt: resolvedAt?.toISOString() ?? null,
    sla: slaFor({ priority: row.priority, status: row.status, slaStartedAt }, now),
    reopenable: canReopen(row, now),
  };
}

export function createServiceDesk(db: Db) {
  async function findOwnedTicket(employeeId: string, code: string): Promise<TicketRow> {
    const [row] = await db
      .select()
      .from(tickets)
      .where(and(eq(tickets.code, code.toUpperCase()), eq(tickets.requesterId, employeeId)));
    if (!row) throw new DomainError('not_found', `Chamado ${code} não encontrado para este funcionário`);
    return row;
  }

  async function insertUpdate(ticketId: string, input: UpdateInput) {
    await db.insert(ticketUpdates).values({ ticketId, ...input });
  }

  return {
    async findEmployeeByEmail(email: string): Promise<EmployeeRow | null> {
      const [row] = await db.select().from(employees).where(eq(employees.email, email.trim().toLowerCase()));
      return row ?? null;
    },

    async getEmployee(id: string): Promise<EmployeeRow> {
      const [row] = await db.select().from(employees).where(eq(employees.id, id));
      if (!row) throw new DomainError('not_found', 'Funcionário não encontrado');
      return row;
    },

    async listTickets(employeeId: string, scope: 'open' | 'all'): Promise<TicketDto[]> {
      const rows = await db.select().from(tickets).where(eq(tickets.requesterId, employeeId)).orderBy(desc(tickets.updatedAt));
      const now = new Date();
      return rows.filter((r) => scope === 'all' || isOpen(r.status)).map((r) => toDto(r, now));
    },

    async getTicket(employeeId: string, code: string): Promise<TicketDetailDto> {
      const row = await findOwnedTicket(employeeId, code);
      const updates = await db.select().from(ticketUpdates).where(eq(ticketUpdates.ticketId, row.id)).orderBy(asc(ticketUpdates.createdAt));
      return {
        ...toDto(row),
        updates: updates.map((u) => ({ author: u.author, authorName: u.authorName, body: u.body, createdAt: u.createdAt.toISOString() })),
      };
    },

    async findSimilar(employeeId: string, text: string, category?: Category) {
      const now = new Date();
      const rows = await db.select().from(tickets).where(eq(tickets.requesterId, employeeId));
      const candidates = rows.filter((r) => isOpen(r.status) || canReopen(r, now));
      return rankByText(candidates, text, (r) => `${r.title} ${r.description}`, 5)
        .map(({ item, score }) => ({
          ticket: toDto(item, now),
          score: Math.min(1, score + (category && item.category === category ? 0.2 : 0)),
        }))
        .sort((a, b) => b.score - a.score);
    },

    async createTicket(employeeId: string, input: CreateTicketInput): Promise<TicketDto> {
      const employee = await this.getEmployee(employeeId);
      const seq = input.type === 'INC' ? incSequence : reqSequence;
      const result = await db.execute<{ n: string }>(sql`select nextval(${seq.seqName}) as n`);
      const code = `${input.type}-${result.rows[0]!.n}`;

      const [row] = await db
        .insert(tickets)
        .values({ ...input, subcategory: input.subcategory ?? null, code, status: 'aberto', requesterId: employeeId })
        .returning();
      await insertUpdate(row!.id, { author: 'sistema', authorName: 'Nexo Assist', body: `Chamado aberto por ${employee.name} pelo Nexo Assist.` });
      return toDto(row!);
    },

    async addUpdate(employeeId: string, code: string, input: UpdateInput): Promise<TicketDto> {
      const row = await findOwnedTicket(employeeId, code);
      if (!isOpen(row.status)) {
        throw new DomainError('invalid_state', `O chamado ${row.code} está ${row.status}; reabra antes de complementar`);
      }
      await insertUpdate(row.id, input);
      const now = new Date();
      const [updated] = await db
        .update(tickets)
        .set(input.author === 'analista' ? { updatedAt: now, slaStartedAt: now } : { updatedAt: now })
        .where(eq(tickets.id, row.id))
        .returning();
      return toDto(updated!);
    },

    async reopen(employeeId: string, code: string, reason: string, authorName: string): Promise<TicketDto> {
      const row = await findOwnedTicket(employeeId, code);
      if (!canReopen(row, new Date())) {
        throw new DomainError('invalid_state', `O chamado ${row.code} só pode ser reaberto se foi resolvido há até ${REOPEN_WINDOW_DAYS} dias`);
      }
      const now = new Date();
      await insertUpdate(row.id, { author: 'funcionario', authorName, body: `Reaberto: ${reason}` });
      const [updated] = await db
        .update(tickets)
        .set({ status: 'aberto', resolvedAt: null, updatedAt: now, slaStartedAt: now })
        .where(eq(tickets.id, row.id))
        .returning();
      return toDto(updated!);
    },

    async escalate(employeeId: string, code: string, summary: string): Promise<TicketDto> {
      const row = await findOwnedTicket(employeeId, code);
      if (!isOpen(row.status)) throw new DomainError('invalid_state', `O chamado ${row.code} já está encerrado`);
      await insertUpdate(row.id, { author: 'agent', authorName: 'Nexo Assist', body: `Transferido para um analista. Resumo: ${summary}` });
      const [updated] = await db
        .update(tickets)
        .set({ status: 'aguardando_analista', updatedAt: new Date() })
        .where(eq(tickets.id, row.id))
        .returning();
      return toDto(updated!);
    },

    async searchArticles(query: string, limit = 3): Promise<Array<{ article: ArticleRow; score: number }>> {
      const all = await db.select().from(articles);
      return rankByText(all, query, (a) => `${a.title} ${a.title} ${a.body}`, limit).map(({ item, score }) => ({ article: item, score }));
    },
  };
}

export type ServiceDesk = ReturnType<typeof createServiceDesk>;
