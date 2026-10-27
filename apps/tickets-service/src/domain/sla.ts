import type { Priority, TicketStatus } from './types.js';
import { isOpen } from './types.js';

const BRT_OFFSET_MS = -3 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
export const BUSINESS_START_HOUR = 8;
export const BUSINESS_END_HOUR = 18;
const BUSINESS_HOURS_PER_DAY = BUSINESS_END_HOUR - BUSINESS_START_HOUR;

type SlaRule = { kind: 'corrido' | 'util'; hours: number; label: string };

export const SLA_RULES: Record<Priority, SlaRule> = {
  critica: { kind: 'corrido', hours: 1, label: '1 hora (plantão 24h)' },
  alta: { kind: 'util', hours: 4, label: '4 horas úteis' },
  media: { kind: 'util', hours: 3 * BUSINESS_HOURS_PER_DAY, label: '3 dias úteis' },
  baixa: { kind: 'util', hours: 5 * BUSINESS_HOURS_PER_DAY, label: '5 dias úteis' },
};

const toLocal = (d: Date) => new Date(d.getTime() + BRT_OFFSET_MS);
const fromLocal = (d: Date) => new Date(d.getTime() - BRT_OFFSET_MS);

const isWeekend = (local: Date) => local.getUTCDay() === 0 || local.getUTCDay() === 6;

function atHour(local: Date, hour: number): Date {
  const d = new Date(local);
  d.setUTCHours(hour, 0, 0, 0);
  return d;
}

function nextBusinessDayStart(local: Date): Date {
  let d = atHour(local, BUSINESS_START_HOUR);
  do {
    d = new Date(d.getTime() + 24 * HOUR_MS);
  } while (isWeekend(d));
  return d;
}

function clampToBusinessTime(local: Date): Date {
  if (isWeekend(local)) return nextBusinessDayStart(atHour(local, 0));
  if (local.getUTCHours() < BUSINESS_START_HOUR) return atHour(local, BUSINESS_START_HOUR);
  if (local >= atHour(local, BUSINESS_END_HOUR)) return nextBusinessDayStart(local);
  return local;
}

export function addBusinessHours(start: Date, hours: number): Date {
  let cursor = clampToBusinessTime(toLocal(start));
  let remainingMs = hours * HOUR_MS;

  while (remainingMs > 0) {
    const endOfDay = atHour(cursor, BUSINESS_END_HOUR);
    const availableMs = endOfDay.getTime() - cursor.getTime();
    if (remainingMs <= availableMs) {
      cursor = new Date(cursor.getTime() + remainingMs);
      remainingMs = 0;
    } else {
      remainingMs -= availableMs;
      cursor = nextBusinessDayStart(cursor);
    }
  }
  return fromLocal(cursor);
}

export function computeDueAt(priority: Priority, slaStartedAt: Date): Date {
  const rule = SLA_RULES[priority];
  return rule.kind === 'corrido'
    ? new Date(slaStartedAt.getTime() + rule.hours * HOUR_MS)
    : addBusinessHours(slaStartedAt, rule.hours);
}

export type SlaInfo = {
  dueAt: string;
  overdue: boolean;
  rule: string;
};


export function slaFor(
  ticket: { priority: Priority; status: TicketStatus; slaStartedAt: Date },
  now: Date = new Date(),
): SlaInfo {
  const dueAt = computeDueAt(ticket.priority, ticket.slaStartedAt);
  return {
    dueAt: dueAt.toISOString(),
    overdue: isOpen(ticket.status) && now > dueAt,
    rule: SLA_RULES[ticket.priority].label,
  };
}
