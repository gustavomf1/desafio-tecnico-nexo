export const TICKET_TYPES = ['INC', 'REQ'] as const;
export type TicketType = (typeof TICKET_TYPES)[number];

export const CATEGORIES = ['Acesso', 'Rede e VPN', 'Hardware', 'Software', 'E-mail', 'Outros'] as const;
export type Category = (typeof CATEGORIES)[number];

export const PRIORITIES = ['critica', 'alta', 'media', 'baixa'] as const;
export type Priority = (typeof PRIORITIES)[number];

export type TicketStatus = 'aberto' | 'aguardando_analista' | 'em_andamento' | 'aprovado' | 'resolvido' | 'fechado';

export type Employee = {
  id: string;
  email: string;
  name: string;
  department: string;
  role: 'funcionario' | 'analista';
  team: string | null;
};

export type Sla = { dueAt: string; overdue: boolean; rule: string };

export type Ticket = {
  code: string;
  type: TicketType;
  category: Category;
  subcategory: string | null;
  priority: Priority;
  status: TicketStatus;
  title: string;
  description: string;
  affected: string;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  sla: Sla;
  reopenable: boolean;
};

export type TicketDetail = Ticket & {
  updates: Array<{ author: string; authorName: string; body: string; createdAt: string }>;
};

export type Article = { id: string; title: string; body: string; category: Category };

export type NewTicket = {
  type: TicketType;
  category: Category;
  subcategory?: string | undefined;
  priority: Priority;
  title: string;
  description: string;
  affected: string;
};
