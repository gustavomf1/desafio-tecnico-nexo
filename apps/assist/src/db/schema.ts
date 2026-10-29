import { index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import type { ConversationState, DecisionTrace, UiBlock } from '../agent/state.js';

export const CONVERSATION_STATUSES = ['agent', 'aguardando_analista', 'com_analista', 'encerrada'] as const;
export type ConversationStatus = (typeof CONVERSATION_STATUSES)[number];

export type MessageRole = 'funcionario' | 'agent' | 'analista' | 'sistema';

export const conversations = pgTable(
  'conversations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    employeeId: uuid('employee_id').notNull(),
    employeeName: text('employee_name').notNull(),
    employeeEmail: text('employee_email').notNull(),
    employeeDepartment: text('employee_department').notNull(),
    title: text('title'),
    status: text('status').$type<ConversationStatus>().notNull().default('agent'),
    state: jsonb('state').$type<ConversationState>().notNull(),
    analystName: text('analyst_name'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('conversations_employee_idx').on(t.employeeId), index('conversations_status_idx').on(t.status)],
);

export const messages = pgTable(
  'messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id),
    role: text('role').$type<MessageRole>().notNull(),
    authorName: text('author_name').notNull(),
    content: text('content').notNull(),
    blocks: jsonb('blocks').$type<UiBlock[]>().notNull().default([]),
    trace: jsonb('trace').$type<DecisionTrace>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('messages_conversation_idx').on(t.conversationId, t.createdAt)],
);

export type ConversationRow = typeof conversations.$inferSelect;
export type MessageRow = typeof messages.$inferSelect;
