'use client';

import { Headset } from 'lucide-react';
import { useEffect } from 'react';
import { HANDOFF_REASON, time } from '@/lib/format';
import type { Message, UiBlock } from '@/lib/types';
import { DraftCard } from './draft-card';
import { TicketCard, TicketSelector } from './tickets';
import { AgentStatusLine } from './trace';

export type MessageActions = {
  interactive: boolean;
  onSend?: (text: string) => void;
  onEdit?: (prefill: string) => void;
};

function Options({ question, options, actions }: { question: string; options: string[]; actions: MessageActions }) {
  useEffect(() => {
    if (!actions.interactive) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT' || e.metaKey || e.ctrlKey || e.altKey) return;
      const option = options[Number(e.key) - 1];
      if (option) actions.onSend?.(option);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [actions, options]);

  return (
    <>
      {question && <div className="question">{question}</div>}
      <div className="options">
        {options.map((option, i) => (
          <button key={option} type="button" className="option" disabled={!actions.interactive} onClick={() => actions.onSend?.(option)}>
            <span className="key">{i + 1}</span>
            {option}
          </button>
        ))}
      </div>
    </>
  );
}

function HandoffNotice({ block }: { block: Extract<UiBlock, { type: 'handoff' }> }) {
  return (
    <div className="handoff-notice">
      <Headset size={16} />
      <div>
        <strong>Conversa transferida para um analista</strong>
        <span>
          Motivo: {HANDOFF_REASON[block.handoff.reason]}
          {block.handoff.ticketCode ? ` · ${block.handoff.ticketCode}` : ''}. O assistente fica pausado até o analista devolver a conversa.
        </span>
      </div>
    </div>
  );
}

function Block({ block, actions }: { block: UiBlock; actions: MessageActions }) {
  switch (block.type) {
    case 'tickets':
      return block.tickets.length === 1 ? (
        <TicketCard ticket={block.tickets[0]!} />
      ) : (
        <TicketSelector tickets={block.tickets} disabled={!actions.interactive} onSelect={(t) => actions.onSend?.(`${t.code} · ${t.title}`)} />
      );
    case 'ticket':
      return <TicketCard ticket={block.ticket} event={block.event} />;
    case 'draft':
      return (
        <DraftCard
          draft={block.draft}
          duplicateOf={block.duplicateOf}
          pending={actions.interactive}
          disabled={!actions.interactive}
          onConfirm={() => actions.onSend?.('Confirmo, pode seguir.')}
          onEdit={() => actions.onEdit?.('Quero alterar o rascunho: ')}
          onCancel={() => actions.onSend?.('Cancela esse rascunho, não precisa.')}
        />
      );
    case 'handoff':
      return <HandoffNotice block={block} />;
    case 'options':
      return null;
  }
}

export function MessageView({ message, actions, showTraceOpen = false }: { message: Message; actions: MessageActions; showTraceOpen?: boolean }) {
  if (message.role === 'funcionario') {
    return (
      <div className="msg-user">
        <div className="bubble">{message.content}</div>
        <span className="time">{time(message.createdAt)}</span>
      </div>
    );
  }

  if (message.role === 'sistema') {
    return <div className="msg-system">{message.content}</div>;
  }

  if (message.role === 'analista') {
    return (
      <div className="msg-agent analyst">
        <div className="status-line">
          <span className="who">{message.authorName}</span>
          <span className="badge">analista do service desk</span>
        </div>
        <div className="bubble">{message.content}</div>
      </div>
    );
  }

  const listed = message.blocks.flatMap((b) => (b.type === 'tickets' ? b.tickets.map((t) => t.code) : []));
  const rawOptions = message.blocks.find((b): b is Extract<UiBlock, { type: 'options' }> => b.type === 'options');
  const options = rawOptions && rawOptions.options.some((o) => listed.some((code) => o.includes(code))) ? undefined : rawOptions;
  const focused = message.blocks.some((b) => (b.type === 'tickets' && b.tickets.length === 1) || b.type === 'ticket');
  const blocks = focused ? message.blocks.filter((b) => !(b.type === 'tickets' && b.tickets.length > 1)) : message.blocks;
  return (
    <div className="msg-agent">
      <AgentStatusLine trace={message.trace} defaultOpen={showTraceOpen} />
      {(message.content || options) && (
        <div className="bubble">
          {message.content && <div className="text">{message.content}</div>}
          {options && <Options question={options.question} options={options.options} actions={actions} />}
        </div>
      )}
      {blocks.map((block, i) => (
        <Block key={i} block={block} actions={actions} />
      ))}
    </div>
  );
}

export function StreamingMessage({ text }: { text: string }) {
  return (
    <div className="msg-agent">
      <div className="status-line">
        <span className="who">Nexo Assist</span>
        <span className="step thinking">
          <span className="spinner" /> {text ? 'respondendo' : 'analisando seu pedido'}
        </span>
      </div>
      {text && (
        <div className="bubble">
          <div className="text">
            {text}
            <span className="caret" />
          </div>
        </div>
      )}
    </div>
  );
}
