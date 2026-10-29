import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import type { ChatMessage } from './agent/nexo-agent.js';
import { HISTORY_WINDOW } from './agent/nexo-agent.js';
import { initialState, type ConversationState, type DecisionTrace, type UiBlock } from './agent/state.js';
import type { SessionUser } from './auth.js';
import type { Db } from './db/client.js';
import { conversations, messages, type ConversationRow, type ConversationStatus, type MessageRole, type MessageRow } from './db/schema.js';

export class NotFoundError extends Error {}
export class ConflictError extends Error {}

export type ConversationDto = Omit<ConversationRow, 'state' | 'createdAt' | 'updatedAt'> & {
  createdAt: string;
  updatedAt: string;
  handoff: ConversationState['handoff'];
};

export type MessageDto = Omit<MessageRow, 'createdAt' | 'conversationId'> & { createdAt: string };

export const toConversationDto = ({ state, createdAt, updatedAt, ...rest }: ConversationRow): ConversationDto => ({
  ...rest,
  handoff: state.handoff,
  createdAt: createdAt.toISOString(),
  updatedAt: updatedAt.toISOString(),
});

export const toMessageDto = ({ conversationId: _c, createdAt, ...rest }: MessageRow): MessageDto => ({ ...rest, createdAt: createdAt.toISOString() });

export function toChatHistory(rows: MessageRow[]): ChatMessage[] {
  return rows
    .filter((m) => m.role !== 'sistema' && m.content.length > 0)
    .slice(-HISTORY_WINDOW)
    .map((m): ChatMessage => (m.role === 'funcionario' ? { role: 'user', content: m.content } : { role: 'assistant', content: m.role === 'analista' ? `[Analista ${m.authorName}] ${m.content}` : m.content }));
}

export function createConversationStore(db: Db) {
  async function get(id: string): Promise<ConversationRow> {
    const [row] = await db.select().from(conversations).where(eq(conversations.id, id));
    if (!row) throw new NotFoundError('Conversa não encontrada');
    return row;
  }

  return {
    get,

    async getOwned(id: string, employeeId: string): Promise<ConversationRow> {
      const [row] = await db.select().from(conversations).where(and(eq(conversations.id, id), eq(conversations.employeeId, employeeId)));
      if (!row) throw new NotFoundError('Conversa não encontrada');
      return row;
    },

    async create(user: SessionUser): Promise<ConversationRow> {
      const [row] = await db
        .insert(conversations)
        .values({ employeeId: user.id, employeeName: user.name, employeeEmail: user.email, employeeDepartment: user.department, state: initialState() })
        .returning();
      return row!;
    },

    listByEmployee: (employeeId: string) => db.select().from(conversations).where(eq(conversations.employeeId, employeeId)).orderBy(desc(conversations.updatedAt)),

    listForConsole: (statuses?: ConversationStatus[]) =>
      db
        .select()
        .from(conversations)
        .where(statuses?.length ? inArray(conversations.status, statuses) : undefined)
        .orderBy(desc(conversations.updatedAt))
        .limit(100),

    messagesOf: (conversationId: string) => db.select().from(messages).where(eq(messages.conversationId, conversationId)).orderBy(asc(messages.createdAt)),

    async addMessage(conversationId: string, msg: { role: MessageRole; authorName: string; content: string; blocks?: UiBlock[]; trace?: DecisionTrace | null }): Promise<MessageRow> {
      const [row] = await db
        .insert(messages)
        .values({ conversationId, role: msg.role, authorName: msg.authorName, content: msg.content, blocks: msg.blocks ?? [], trace: msg.trace ?? null })
        .returning();
      await db.update(conversations).set({ updatedAt: new Date() }).where(eq(conversations.id, conversationId));
      return row!;
    },

    async update(id: string, changes: Partial<Pick<ConversationRow, 'status' | 'state' | 'analystName' | 'title'>>): Promise<ConversationRow> {
      const [row] = await db
        .update(conversations)
        .set({ ...changes, updatedAt: new Date() })
        .where(eq(conversations.id, id))
        .returning();
      if (!row) throw new NotFoundError('Conversa não encontrada');
      return row;
    },
  };
}

export type ConversationStore = ReturnType<typeof createConversationStore>;
