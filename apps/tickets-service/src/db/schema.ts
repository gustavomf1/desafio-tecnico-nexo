import { index, pgSequence, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import type { Category, Priority, TicketStatus, TicketType, UpdateAuthor } from '../domain/types.js';
  
export const incSequence = pgSequence('inc_code_seq', { startWith: 20520 });
export const reqSequence = pgSequence('req_code_seq', { startWith: 10460 });
  
export const employees = pgTable('employees', {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull().unique(),
    name: text('name').notNull(),
    department: text('department').notNull(),
    role: text('role').$type<'funcionario' | 'analista'>().notNull().default('funcionario'),
    team: text('team'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
 });

export const articles = pgTable('articles', {
    id: text('id').primaryKey(),
    title: text('title').notNull(),
    body: text('body').notNull(),
    category: text('category').$type<Category>().notNull(),
});

export const tickets = pgTable(
    'tickets',
    {
      id: uuid('id').primaryKey().defaultRandom(),
      code: text('code').notNull().unique(),
      type: text('type').$type<TicketType>().notNull(),
      category: text('category').$type<Category>().notNull(),
      subcategory: text('subcategory'),
      priority: text('priority').$type<Priority>().notNull(),
      status: text('status').$type<TicketStatus>().notNull(),
      title: text('title').notNull(),
      description: text('description').notNull(),
      affected: text('affected').notNull(),
      requesterId: uuid('requester_id')
        .notNull() 
        .references(() => employees.id),
      createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
      updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
      slaStartedAt: timestamp('sla_started_at', { withTimezone: true }).notNull().defaultNow(),
      resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    },
    (t) => [index('tickets_requester_idx').on(t.requesterId)],
);

export const ticketUpdates = pgTable(
    'ticket_updates',
    {
      id: uuid('id').primaryKey().defaultRandom(),
      ticketId: uuid('ticket_id')
        .notNull()
        .references(() => tickets.id),
      author: text('author').$type<UpdateAuthor>().notNull(),
      authorName: text('author_name').notNull(),
      body: text('body').notNull(),
      createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    },
    (t) => [index('ticket_updates_ticket_idx').on(t.ticketId)],
);
  
export type EmployeeRow = typeof employees.$inferSelect;
export type ArticleRow = typeof articles.$inferSelect;
export type TicketRow = typeof tickets.$inferSelect;
export type TicketUpdateRow = typeof ticketUpdates.$inferSelect;