import type { Employee, NewTicket, Priority, Ticket } from '../tickets/types.js';

export type ConversationState = {
  turn: number;
  draft: Draft | null;
  handoff: Handoff | null;
};

export type Draft =
  | { id: string; kind: 'create'; createdTurn: number; ticket: NewTicket; priorityReason: string; slaRule: string }
  | { id: string; kind: 'update'; createdTurn: number; code: string; title: string; text: string; duplicate: boolean }
  | { id: string; kind: 'reopen'; createdTurn: number; code: string; title: string; text: string; duplicate: boolean };

export const HANDOFF_REASONS = ['pedido', 'critico', 'vencido', 'incerteza'] as const;
export type HandoffReason = (typeof HANDOFF_REASONS)[number];

export type Handoff = { reason: HandoffReason; summary: string; ticketCode: string | null; at: string; confidence?: number };

export const initialState = (): ConversationState => ({ turn: 0, draft: null, handoff: null });

export type UiBlock =
  | { type: 'tickets'; tickets: Ticket[] }
  | { type: 'ticket'; ticket: Ticket; event: 'criado' | 'atualizado' | 'reaberto' }
  | { type: 'draft'; draft: Draft; duplicateOf?: Ticket | undefined }
  | { type: 'options'; question: string; options: string[] }
  | { type: 'handoff'; handoff: Handoff };

export type DecisionReport = {
  intent: string;
  action: string;
  confidence: number;
  reason: string;
};

export type TraceStep = {
  tool: string;
  label: string;
  input: unknown;
  ok: boolean;
  summary: string;
  durationMs: number;
  retries: number;
};

export type DecisionTrace = {
  model: string;
  decision: DecisionReport | null;
  steps: TraceStep[];
  guardrails: string[];
  usage: { inputTokens: number; outputTokens: number } | null;
  durationMs: number;
};

export const PRIORITY_INFO: Record<Priority, { label: string; sla: string }> = {
  critica: { label: 'Crítica', sla: '1 hora (plantão 24h)' },
  alta: { label: 'Alta', sla: '4 horas úteis' },
  media: { label: 'Média', sla: '3 dias úteis' },
  baixa: { label: 'Baixa', sla: '5 dias úteis' },
};

export type Session = { employee: Employee };
