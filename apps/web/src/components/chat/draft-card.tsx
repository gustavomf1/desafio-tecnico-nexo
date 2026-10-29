'use client';

import { Info } from 'lucide-react';
import { PRIORITY } from '@/lib/format';
import type { Draft, Ticket } from '@/lib/types';

type Props = {
  draft: Draft;
  duplicateOf?: Ticket;
  pending: boolean;
  disabled: boolean;
  onConfirm?: () => void;
  onEdit?: () => void;
  onCancel?: () => void;
};

const KIND_LABEL = { create: 'Novo chamado', update: 'Complemento de chamado', reopen: 'Reabertura de chamado' } as const;

export function DraftCard({ draft, duplicateOf, pending, disabled, onConfirm, onEdit, onCancel }: Props) {
  return (
    <div className="card draft-card">
      <div className="body">
        <div className="eyebrow">
          <span>{KIND_LABEL[draft.kind]}</span>
          <span className="sep" />
          <span className="mono">Rascunho {draft.id.toUpperCase()}</span>
          <span className="spacer" />
          {pending ? (
            <span className="state tone-warning">
              <span className="dot tone-warning" /> Aguardando confirmação
            </span>
          ) : (
            <span className="state tone-neutral">Rascunho fechado</span>
          )}
        </div>
        {draft.kind === 'create' ? (
          <>
            <div className="title">{draft.ticket.title}</div>
            <div className="description">{draft.ticket.description}</div>
          </>
        ) : (
          <>
            <div className="title">
              <span className="mono muted">{draft.code}</span> {draft.title}
            </div>
            <div className="description">
              {draft.kind === 'reopen' ? 'Motivo da reabertura: ' : 'Informação nova: '}
              {draft.text}
            </div>
          </>
        )}
      </div>

      {draft.kind === 'create' ? (
        <div className="ticket-fields">
          <div>
            <span className="key">Tipo e categoria</span>
            <span className="value">
              {draft.ticket.type} · {draft.ticket.category}
            </span>
          </div>
          <div>
            <span className="key">Prioridade</span>
            <span className="value">
              <span className={`dot tone-${PRIORITY[draft.ticket.priority].tone}`} /> {PRIORITY[draft.ticket.priority].label}
              <span className="muted"> · resposta em até {draft.slaRule}</span>
            </span>
          </div>
          <div>
            <span className="key">Afetados</span>
            <span className="value">{draft.ticket.affected}</span>
          </div>
        </div>
      ) : (
        draft.duplicate &&
        duplicateOf && (
          <div className="duplicate-note">
            <Info size={14} />
            Você já tem o {duplicateOf.code} sobre esse problema, então vou {draft.kind === 'reopen' ? 'reabrir' : 'complementar'} esse chamado em vez de abrir outro.
          </div>
        )
      )}

      {draft.kind === 'create' && <div className="priority-reason muted">Por que essa prioridade: {draft.priorityReason}</div>}

      {pending && (
        <div className="actions">
          <button type="button" className="btn btn-primary" disabled={disabled} onClick={onConfirm}>
            Confirmar <span className="kbd">↵</span>
          </button>
          <button type="button" className="btn btn-outline" disabled={disabled} onClick={onEdit}>
            Editar
          </button>
          <button type="button" className="btn btn-ghost" disabled={disabled} onClick={onCancel}>
            Cancelar
          </button>
        </div>
      )}
    </div>
  );
}
