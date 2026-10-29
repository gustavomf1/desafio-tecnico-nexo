'use client';

import { Headset, Lock, Search, SendHorizontal, Sparkles, UserCheck } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { MessageView, type MessageActions } from '@/components/chat/message-view';
import { useEmployee } from '@/components/employee-context';
import { api } from '@/lib/api';
import { HANDOFF_REASON, PRIORITY, TICKET_STATUS, initials, shortDate, time } from '@/lib/format';
import type { ConsoleDetail, ConsoleListItem, Conversation, Ticket, User } from '@/lib/types';
import '@/components/chat/chat.css';

type Filter = 'todas' | 'para_voce' | 'agent' | 'minhas' | 'encerradas';

const LIST_POLL_MS = 4000;
const DETAIL_POLL_MS = 3000;
const READ_ONLY: MessageActions = { interactive: false };
const AVATAR_COLORS = [
  ['#DCE9F7', '#0062C4'],
  ['#F6E3D3', '#9A4A12'],
  ['#E6E1F7', '#5B3FC4'],
  ['#DDF0E6', '#1E7A4C'],
  ['#F7E1E6', '#A3324F'],
  ['#FBEFD0', '#8A6100'],
];

function avatarStyle(name: string) {
  const sum = [...name].reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  const [bg, fg] = AVATAR_COLORS[sum % AVATAR_COLORS.length]!;
  return { background: bg, color: fg };
}

function matches(filter: Filter, c: Conversation, me: User) {
  if (filter === 'para_voce') return c.status === 'aguardando_analista';
  if (filter === 'agent') return c.status === 'agent';
  if (filter === 'minhas') return c.status === 'com_analista' && c.analystName === me.name;
  if (filter === 'encerradas') return c.status === 'encerrada';
  return true;
}

function tagFor(c: Conversation): { tone: string; label: string } {
  if (c.status === 'aguardando_analista') {
    if (c.handoff?.reason === 'incerteza') {
      const confidence = c.handoff.confidence !== undefined ? ` · confiança ${Math.round(c.handoff.confidence * 100)}%` : '';
      return { tone: 'warning', label: `Agent pediu ajuda${confidence}` };
    }
    return { tone: 'danger', label: `Transferida · ${c.handoff?.ticketCode ?? HANDOFF_REASON[c.handoff?.reason ?? 'pedido']}` };
  }
  if (c.status === 'com_analista') return { tone: 'violet', label: `Com ${c.analystName}` };
  if (c.status === 'encerrada') return { tone: 'neutral', label: 'Encerrada' };
  return { tone: 'success', label: 'Agent atendendo' };
}

function listTime(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return time(iso);
  const yesterday = new Date(today.getTime() - 86_400_000);
  return d.toDateString() === yesterday.toDateString() ? 'ontem' : shortDate(iso);
}

function preview(item: ConsoleListItem) {
  const m = item.lastMessage;
  if (!m) return 'Conversa iniciada';
  if (m.role === 'agent') return `Nexo: ${m.content || 'mostrou cards de chamado'}`;
  if (m.role === 'analista') return `${m.authorName.split(' ')[0]}: ${m.content}`;
  return m.content;
}

function ConversationList({ items, me, selectedId, onSelect }: { items: ConsoleListItem[]; me: User; selectedId: string | null; onSelect: (id: string) => void }) {
  const [filter, setFilter] = useState<Filter>('para_voce');
  const [query, setQuery] = useState('');
  const count = (f: Filter) => items.filter((c) => matches(f, c, me)).length;
  const q = query.trim().toLowerCase();
  const visible = items.filter(
    (c) => c.id === selectedId || (matches(filter, c, me) && (!q || [c.employeeName, c.title ?? '', c.handoff?.ticketCode ?? '', c.employeeEmail].some((v) => v.toLowerCase().includes(q)))),
  );
  const filters: Array<[Filter, string]> = [
    ['todas', 'Todas'],
    ['para_voce', 'Para você'],
    ['agent', 'Com o agent'],
    ['minhas', 'Minhas'],
    ['encerradas', 'Encerradas'],
  ];

  return (
    <section className="chat-list">
      <header>
        <div className="title-row">
          <h1>Conversas</h1>
          <span className="pill tone-success">
            <span className="dot" /> Disponível
          </span>
        </div>
        <label className="search">
          <Search size={15} />
          <input placeholder="Pesquisar conversa ou chamado" value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
        <div className="filters">
          {filters.map(([key, label]) => (
            <button key={key} type="button" className={filter === key ? 'active' : ''} onClick={() => setFilter(key)}>
              {label}
              {key !== 'todas' && <span className="count">{count(key)}</span>}
            </button>
          ))}
        </div>
      </header>
      <div className="items">
        {visible.length === 0 && <div className="empty muted">Nenhuma conversa aqui.</div>}
        {visible.map((c) => {
          const tag = tagFor(c);
          const urgent = c.status === 'aguardando_analista';
          return (
            <button key={c.id} type="button" className={`item ${selectedId === c.id ? 'selected' : ''}`} onClick={() => onSelect(c.id)}>
              <span className="avatar big" style={avatarStyle(c.employeeName)}>
                {initials(c.employeeName)}
              </span>
              <span className="text">
                <span className="top">
                  <span className={`name ${urgent ? 'strong' : ''}`}>{c.employeeName}</span>
                  <span className={`time ${urgent ? 'urgent' : ''}`}>{listTime(c.updatedAt)}</span>
                </span>
                <span className="last">{preview(c)}</span>
                <span className={`tag tone-${tag.tone}`}>
                  <span className={`dot tone-${tag.tone}`} />
                  {tag.label}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function TicketsPanel({ detail }: { detail: ConsoleDetail }) {
  const { conversation, tickets, messages } = detail;
  const first = conversation.employeeName.split(' ')[0];
  if (!tickets) {
    return (
      <aside className="tickets-panel">
        <header>
          <div>
            <strong>Chamados de {first}</strong>
          </div>
        </header>
        <div className="body">
          <div className="error-banner">Sistema de chamados indisponível agora. Tente de novo em instantes.</div>
        </div>
      </aside>
    );
  }
  const mentioned = new Set(
    messages.flatMap((m) => m.blocks.flatMap((b) => (b.type === 'ticket' ? [b.ticket.code] : b.type === 'tickets' && b.tickets.length === 1 ? [b.tickets[0]!.code] : b.type === 'handoff' && b.handoff.ticketCode ? [b.handoff.ticketCode] : []))),
  );
  if (conversation.handoff?.ticketCode) mentioned.add(conversation.handoff.ticketCode);
  const current = tickets.filter((t) => mentioned.has(t.code));
  const others = tickets.filter((t) => !mentioned.has(t.code));
  const open = tickets.filter((t) => t.status !== 'resolvido' && t.status !== 'fechado').length;

  return (
    <aside className="tickets-panel">
      <header>
        <div>
          <strong>Chamados de {first}</strong>
          <span className="muted">
            {open} abertos · {tickets.length - open} encerrados
          </span>
        </div>
      </header>
      <div className="body">
        {conversation.handoff && (
          <section>
            <span className="label">Resumo do agent para você</span>
            <div className="handoff-summary">
              <span className="reason">
                <Sparkles size={13} /> {HANDOFF_REASON[conversation.handoff.reason]}
              </span>
              {conversation.handoff.summary}
            </div>
          </section>
        )}
        {current.length > 0 && (
          <section>
            <span className="label">Desta conversa</span>
            {current.map((t) => (
              <CurrentTicket key={t.code} ticket={t} />
            ))}
          </section>
        )}
        <section>
          <span className="label">{current.length ? 'Outros chamados' : 'Chamados'}</span>
          {others.length === 0 && <span className="muted">Nenhum outro chamado.</span>}
          {others.map((t) => (
            <div key={t.code} className="other-ticket">
              <span className="title">{t.title}</span>
              <span className="muted">
                {t.code} · {t.sla.overdue ? 'Vencido' : TICKET_STATUS[t.status].label}
                {t.resolvedAt ? ` em ${shortDate(t.resolvedAt)}` : ''}
              </span>
            </div>
          ))}
        </section>
      </div>
    </aside>
  );
}

function CurrentTicket({ ticket }: { ticket: Ticket }) {
  const status = TICKET_STATUS[ticket.status];
  return (
    <div className="current-ticket">
      <div className="row">
        <span className="mono muted">{ticket.code}</span>
        <span className={`state tone-${ticket.sla.overdue ? 'danger' : status.tone}`}>{ticket.sla.overdue ? 'Prazo vencido' : status.label}</span>
      </div>
      <strong>{ticket.title}</strong>
      <span className="muted">
        {ticket.category} · prioridade {PRIORITY[ticket.priority].label.toLowerCase()}
      </span>
      <div className="last-event">
        <span>{ticket.description}</span>
      </div>
    </div>
  );
}

function ConversationPane({ detail, me, onChange }: { detail: ConsoleDetail; me: User; onChange: (d: ConsoleDetail) => void }) {
  const { conversation, messages } = detail;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const first = conversation.employeeName.split(' ')[0];
  const mine = conversation.status === 'com_analista' && conversation.analystName === me.name;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length, conversation.id]);

  async function act(path: 'assume' | 'release' | 'close' | 'messages', body?: unknown) {
    setBusy(true);
    setError(null);
    try {
      onChange(await api<ConsoleDetail>(`/console/conversations/${conversation.id}/${path}`, { method: 'POST', body }));
      if (path === 'messages') setText('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível concluir a ação.');
    } finally {
      setBusy(false);
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (text.trim()) void act('messages', { content: text.trim() });
    }
  }

  const mode =
    conversation.status === 'aguardando_analista'
      ? { tone: 'warning', label: 'Aguardando atendente' }
      : conversation.status === 'com_analista'
        ? { tone: 'violet', label: mine ? 'Você está atendendo' : `${conversation.analystName} atendendo` }
        : conversation.status === 'encerrada'
          ? { tone: 'neutral', label: 'Encerrada' }
          : { tone: 'success', label: 'Agent atendendo' };

  return (
    <section className="conversation">
      <header>
        <span className="avatar" style={avatarStyle(conversation.employeeName)}>
          {initials(conversation.employeeName)}
        </span>
        <div className="who">
          <strong>{conversation.employeeName}</strong>
          <span className="muted">
            {conversation.employeeDepartment} · {conversation.employeeEmail}
            {conversation.handoff?.ticketCode ? ` · ${conversation.handoff.ticketCode}` : ''}
          </span>
        </div>
        <span className={`pill tone-${mode.tone}`}>
          <span className="dot" /> {mode.label}
        </span>
      </header>

      <div className="thread">
        {messages.length === 0 && <div className="msg-system">Conversa sem mensagens ainda.</div>}
        {messages.map((m) => (
          <MessageView key={m.id} message={m} actions={READ_ONLY} />
        ))}
        <div ref={bottomRef} />
      </div>

      <div className="takeover">
        {error && <div className="error-banner">{error}</div>}
        {mine ? (
          <>
            <div className="row">
              <span className="icon tone-violet">
                <UserCheck size={17} />
              </span>
              <div className="text">
                <strong>Você está atendendo {first}</strong>
                <span className="muted">O agent está pausado até você devolver ou encerrar.</span>
              </div>
              <button type="button" className="btn btn-outline" disabled={busy} onClick={() => void act('release')}>
                Devolver ao agent
              </button>
              <button type="button" className="btn btn-danger" disabled={busy} onClick={() => void act('close')}>
                Encerrar atendimento
              </button>
            </div>
            <div className="composer">
              <textarea rows={1} autoFocus placeholder={`Responder ${first}…`} value={text} disabled={busy} onChange={(e) => setText(e.target.value)} onKeyDown={onKeyDown} />
              <button type="button" className="btn btn-primary" disabled={busy || !text.trim()} onClick={() => void act('messages', { content: text.trim() })}>
                <SendHorizontal size={14} /> Enviar
              </button>
            </div>
          </>
        ) : conversation.status === 'encerrada' ? (
          <div className="row">
            <span className="icon tone-neutral">
              <Lock size={17} />
            </span>
            <div className="text">
              <strong>Atendimento encerrado</strong>
              <span className="muted">{first} pode abrir uma nova conversa quando precisar.</span>
            </div>
          </div>
        ) : (
          <>
            <div className="row">
              <span className={`icon tone-${conversation.status === 'aguardando_analista' ? 'warning' : conversation.status === 'com_analista' ? 'violet' : 'success'}`}>
                <Headset size={17} />
              </span>
              <div className="text">
                <strong>
                  {conversation.status === 'aguardando_analista'
                    ? `${first} espera um atendente`
                    : conversation.status === 'com_analista'
                      ? `${conversation.analystName} está atendendo`
                      : `O Nexo Assist está atendendo ${first}`}
                </strong>
                <span className="muted">
                  {conversation.status === 'aguardando_analista' && conversation.handoff
                    ? `Agent pausado · ${HANDOFF_REASON[conversation.handoff.reason]} · desde ${time(conversation.handoff.at)}`
                    : conversation.status === 'agent'
                      ? 'Você pode assumir a qualquer momento; o agent para de responder.'
                      : 'Só quem assumiu pode responder.'}
                </span>
              </div>
              {conversation.status === 'aguardando_analista' && (
                <button type="button" className="btn btn-outline" disabled={busy} onClick={() => void act('release')}>
                  Devolver ao agent
                </button>
              )}
              {conversation.status !== 'com_analista' && (
                <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void act('assume')}>
                  Assumir atendimento
                </button>
              )}
            </div>
            <div className="composer locked">
              <textarea rows={1} disabled placeholder="Assuma o atendimento para responder" />
            </div>
          </>
        )}
      </div>
    </section>
  );
}

export default function ConsolePage() {
  const { user } = useEmployee();
  const [items, setItems] = useState<ConsoleListItem[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ConsoleDetail | null>(null);

  const loadList = useCallback(async () => {
    try {
      const list = await api<ConsoleListItem[]>('/console/conversations');
      setItems(list);
      setListError(null);
      setSelectedId((current) => current ?? list.find((c) => c.status === 'aguardando_analista')?.id ?? list[0]?.id ?? null);
    } catch (err) {
      setListError(err instanceof Error ? err.message : 'Não foi possível carregar as conversas.');
    }
  }, []);

  useEffect(() => {
    void loadList();
    const timer = setInterval(() => void loadList(), LIST_POLL_MS);
    return () => clearInterval(timer);
  }, [loadList]);

  useEffect(() => {
    if (!selectedId) return;
    let alive = true;
    const load = async () => {
      const fresh = await api<ConsoleDetail>(`/console/conversations/${selectedId}`).catch(() => null);
      if (alive && fresh) setDetail(fresh);
    };
    setDetail((d) => (d?.conversation.id === selectedId ? d : null));
    void load();
    const timer = setInterval(() => void load(), DETAIL_POLL_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [selectedId]);

  const onChange = useCallback(
    (d: ConsoleDetail) => {
      setDetail(d);
      void loadList();
    },
    [loadList],
  );

  const waiting = useMemo(() => items?.filter((c) => c.status === 'aguardando_analista').length ?? 0, [items]);

  return (
    <>
      {items === null ? (
        <div className="center-state">{listError ? <div className="error-banner">{listError}</div> : <span className="spinner" />}</div>
      ) : (
        <>
          <ConversationList items={items} me={user} selectedId={selectedId} onSelect={setSelectedId} />
          {detail ? (
            <>
              <ConversationPane key={detail.conversation.id} detail={detail} me={user} onChange={onChange} />
              <TicketsPanel detail={detail} />
            </>
          ) : (
            <div className="center-state conversation-empty">
              {selectedId ? <span className="spinner" /> : <span>Nenhuma conversa ainda. {waiting ? '' : 'Quando um funcionário falar com o Nexo Assist, ela aparece aqui.'}</span>}
            </div>
          )}
        </>
      )}
    </>
  );
}
