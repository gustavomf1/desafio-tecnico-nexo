export type Priority = 'critica' | 'alta' | 'media' | 'baixa';
export type TicketStatus = 'aberto' | 'aguardando_analista' | 'em_andamento' | 'aprovado' | 'resolvido' | 'fechado';
export type ConversationStatus = 'agent' | 'aguardando_analista' | 'com_analista' | 'encerrada';
export type MessageRole = 'funcionario' | 'agent' | 'analista' | 'sistema';

export type User = {
  id: string;
  email: string;
  name: string;
  department: string;
  role: 'funcionario' | 'analista';
  team: string | null;
};

export type Ticket = {
  code: string;
  type: 'INC' | 'REQ';
  category: string;
  subcategory: string | null;
  priority: Priority;
  status: TicketStatus;
  title: string;
  description: string;
  affected: string;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  sla: { dueAt: string; overdue: boolean; rule: string };
  reopenable: boolean;
};

export type NewTicket = Pick<Ticket, 'type' | 'category' | 'priority' | 'title' | 'description' | 'affected'>;

export type Draft =
  | { id: string; kind: 'create'; createdTurn: number; ticket: NewTicket; priorityReason: string; slaRule: string }
  | { id: string; kind: 'update' | 'reopen'; createdTurn: number; code: string; title: string; text: string; duplicate: boolean };

export type Handoff = { reason: 'pedido' | 'critico' | 'vencido' | 'incerteza'; summary: string; ticketCode: string | null; at: string; confidence?: number };

export type UiBlock =
  | { type: 'tickets'; tickets: Ticket[] }
  | { type: 'ticket'; ticket: Ticket; event: 'criado' | 'atualizado' | 'reaberto' }
  | { type: 'draft'; draft: Draft; duplicateOf?: Ticket }
  | { type: 'options'; question: string; options: string[] }
  | { type: 'handoff'; handoff: Handoff };

export type TraceStep = { tool: string; label: string; input: unknown; ok: boolean; summary: string; durationMs: number; retries: number };

export type DecisionTrace = {
  model: string;
  decision: { intent: string; action: string; confidence: number; reason: string } | null;
  steps: TraceStep[];
  guardrails: string[];
  usage: { inputTokens: number; outputTokens: number } | null;
  durationMs: number;
};

export type Message = {
  id: string;
  role: MessageRole;
  authorName: string;
  content: string;
  blocks: UiBlock[];
  trace: DecisionTrace | null;
  createdAt: string;
};

export type Conversation = {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeEmail: string;
  employeeDepartment: string;
  title: string | null;
  status: ConversationStatus;
  analystName: string | null;
  handoff: Handoff | null;
  createdAt: string;
  updatedAt: string;
};

export type ConversationDetail = { conversation: Conversation; messages: Message[] };
export type ConsoleDetail = ConversationDetail & { tickets: Ticket[] | null };

export type ConsoleListItem = Conversation & { lastMessage: Pick<Message, 'role' | 'authorName' | 'content' | 'createdAt'> | null };
