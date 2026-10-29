'use client';

import { PRIORITY, TICKET_STATUS, dateTime, relative, shortDate } from '@/lib/format';
import type { Ticket } from '@/lib/types';

const EVENT_LABEL = { criado: 'Chamado criado', atualizado: 'Chamado atualizado', reaberto: 'Chamado reaberto' } as const;

export function TicketCard({ ticket, event }: { ticket: Ticket; event?: keyof typeof EVENT_LABEL }) {
  const status = TICKET_STATUS[ticket.status];
  const priority = PRIORITY[ticket.priority];
  return (
    <div className="card ticket-card">
      <div className="body">
        <div className="eyebrow">
          <span>{event ? EVENT_LABEL[event] : 'Chamado'}</span>
          <span className="sep" />
          <span className="mono">{ticket.code}</span>
          <span className="spacer" />
          <span className={`state tone-${status.tone}`}>
            <span className={`dot tone-${status.tone}`} />
            {status.label}
          </span>
        </div>
        <div className="title">{ticket.title}</div>
        <div className="description">{ticket.description}</div>
      </div>
      <div className="ticket-fields">
        <div>
          <span className="key">Categoria</span>
          <span className="value">
            {ticket.category}
            {ticket.subcategory ? ` › ${ticket.subcategory}` : ''}
          </span>
        </div>
        <div>
          <span className="key">Prioridade</span>
          <span className="value">
            <span className={`dot tone-${priority.tone}`} /> {priority.label}
          </span>
        </div>
        <div>
          <span className="key">Aberto em</span>
          <span className="value">{dateTime(ticket.createdAt)}</span>
        </div>
        <div>
          <span className="key">Última atualização</span>
          <span className="value">
            <span className={ticket.sla.overdue ? 'warning-text' : ''}>{relative(ticket.updatedAt)}</span>
            {ticket.sla.overdue ? <span className="muted"> · prazo vencido</span> : ticket.status !== 'resolvido' && ticket.status !== 'fechado' ? <span className="muted"> · prazo {dateTime(ticket.sla.dueAt)}</span> : null}
          </span>
        </div>
      </div>
    </div>
  );
}

export function TicketSelector({ tickets, onSelect, disabled }: { tickets: Ticket[]; onSelect?: (ticket: Ticket) => void; disabled: boolean }) {
  return (
    <div className="card ticket-selector" role="list">
      {tickets.map((t) => {
        const status = TICKET_STATUS[t.status];
        return (
          <button key={t.code} type="button" role="listitem" className="row" disabled={disabled} onClick={() => onSelect?.(t)}>
            <span className="radio" />
            <span className="code mono">{t.code}</span>
            <span className="title">{t.title}</span>
            <span className="status">
              <span className={`dot tone-${status.tone}`} />
              {t.sla.overdue ? 'Vencido' : status.label}
            </span>
            <span className="date">{shortDate(t.updatedAt)}</span>
          </button>
        );
      })}
    </div>
  );
}
