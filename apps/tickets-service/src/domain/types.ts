export const TICKET_TYPES = ['INC', 'REQ'] as const;
export type TicketType = (typeof TICKET_TYPES)[number];
  
export const CATEGORIES = ['Acesso', 'Rede e VPN', 'Hardware', 'Software', 'E-mail', 'Outros'] as const;
export type Category = (typeof CATEGORIES)[number];
  
export const PRIORITIES = ['critica', 'alta', 'media', 'baixa'] as const;
export type Priority = (typeof PRIORITIES)[number];
  
export const STATUSES = ['aberto', 'aguardando_analista', 'em_andamento', 'aprovado', 'resolvido', 'fechado'] as const;
export type TicketStatus = (typeof STATUSES)[number];
  
export const CLOSED_STATUSES: readonly TicketStatus[] = ['resolvido', 'fechado'];

export function isOpen(status: TicketStatus): boolean {
    return !CLOSED_STATUSES.includes(status);
} 

export const UPDATE_AUTHORS = ['funcionario', 'agent', 'analista', 'sistema'] as const;
export type UpdateAuthor = (typeof UPDATE_AUTHORS)[number];

export const REOPEN_WINDOW_DAYS = 7;