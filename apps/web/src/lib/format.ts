import type { ConversationStatus, Priority, TicketStatus } from './types';

type Tone = 'primary' | 'success' | 'warning' | 'danger' | 'violet' | 'neutral';

export const TICKET_STATUS: Record<TicketStatus, { label: string; tone: Tone }> = {
  aberto: { label: 'Aberto', tone: 'primary' },
  aguardando_analista: { label: 'Aguardando analista', tone: 'warning' },
  em_andamento: { label: 'Em andamento', tone: 'primary' },
  aprovado: { label: 'Aprovado', tone: 'success' },
  resolvido: { label: 'Resolvido', tone: 'success' },
  fechado: { label: 'Fechado', tone: 'neutral' },
};

export const PRIORITY: Record<Priority, { label: string; tone: Tone }> = {
  critica: { label: 'Crítica', tone: 'danger' },
  alta: { label: 'Alta', tone: 'warning' },
  media: { label: 'Média', tone: 'neutral' },
  baixa: { label: 'Baixa', tone: 'neutral' },
};

export const CONVERSATION_STATUS: Record<ConversationStatus, { label: string; tone: Tone }> = {
  agent: { label: 'Com o Nexo Assist', tone: 'success' },
  aguardando_analista: { label: 'Aguardando atendente', tone: 'warning' },
  com_analista: { label: 'Com analista', tone: 'violet' },
  encerrada: { label: 'Encerrada', tone: 'neutral' },
};

export const HANDOFF_REASON = {
  pedido: 'pedido do funcionário',
  critico: 'caso crítico',
  vencido: 'chamado vencido',
  incerteza: 'o assistente não teve segurança para decidir',
} as const;

const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

export function shortDate(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')} ${MONTHS[d.getMonth()]}`;
}

export function dateTime(iso: string): string {
  const d = new Date(iso);
  return `${shortDate(iso)}, ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
}

export function time(iso: string): string {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

export function relative(iso: string, now = Date.now()): string {
  const minutes = Math.round((now - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return 'agora';
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `há ${hours} h`;
  const days = Math.round(hours / 24);
  return days === 1 ? 'há 1 dia' : `há ${days} dias`;
}

export function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');
}

export function sentenceCase(label: string): string {
  return label.charAt(0).toLowerCase() + label.slice(1);
}
