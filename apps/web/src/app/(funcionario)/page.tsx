'use client';

import { ChevronRight, Headset, Lock, Plus, SendHorizontal } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { MessageView, StreamingMessage, type MessageActions } from '@/components/chat/message-view';
import { useEmployee } from '@/components/employee-context';
import { api, sendMessage } from '@/lib/api';
import { CONVERSATION_STATUS } from '@/lib/format';
import type { Conversation, ConversationDetail } from '@/lib/types';
import '@/components/chat/chat.css';

const MAX_MESSAGES = 30;
const POLL_MS = 3000;
const SUGGESTIONS = ['Como está meu chamado?', 'A VPN não conecta', 'Preciso de acesso a uma pasta', 'Qual o horário do service desk?'];

export default function ChatPage() {
  const { user } = useEmployee();
  const [detail, setDetail] = useState<ConversationDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [streamText, setStreamText] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const list = await api<Conversation[]>('/conversations');
      const current = list.find((c) => c.status !== 'encerrada') ?? (await api<Conversation>('/conversations', { method: 'POST' }));
      setDetail(await api<ConversationDetail>(`/conversations/${current.id}`));
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Não foi possível carregar a conversa.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const conversation = detail?.conversation;
  const status = conversation?.status;

  useEffect(() => {
    if (!conversation || busy || (status !== 'aguardando_analista' && status !== 'com_analista')) return;
    const timer = setInterval(async () => {
      const fresh = await api<ConversationDetail>(`/conversations/${conversation.id}`).catch(() => null);
      if (fresh) setDetail(fresh);
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [conversation, status, busy]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [detail?.messages.length, streamText]);

  const userCount = detail?.messages.filter((m) => m.role === 'funcionario').length ?? 0;
  const limitReached = userCount >= MAX_MESSAGES;
  const canWrite = !!conversation && !busy && status !== 'encerrada' && !limitReached;

  const send = useCallback(
    async (text: string) => {
      const content = text.trim();
      if (!detail || !content || busy) return;
      setBusy(true);
      setSendError(null);
      setInput('');
      if (detail.conversation.status === 'agent') setStreamText('');
      await sendMessage(detail.conversation.id, content, {
        onUser: (message) => setDetail((d) => (d ? { ...d, messages: [...d.messages, message] } : d)),
        onText: (delta) => setStreamText((t) => (t ?? '') + delta),
        onDone: ({ message, conversation: updated }) => setDetail((d) => (d ? { conversation: updated, messages: message ? [...d.messages, message] : d.messages } : d)),
        onError: (message) => setSendError(message),
      });
      setStreamText(null);
      setBusy(false);
      inputRef.current?.focus();
    },
    [detail, busy],
  );

  async function newConversation() {
    if (busy) return;
    const created = await api<Conversation>('/conversations', { method: 'POST' });
    setDetail({ conversation: created, messages: [] });
    setSendError(null);
  }

  const lastMessage = detail?.messages.at(-1);
  const actions = useMemo<MessageActions>(
    () => ({
      interactive: false,
      onSend: (text) => void send(text),
      onEdit: (prefill) => {
        setInput(prefill);
        inputRef.current?.focus();
      },
    }),
    [send],
  );
  const latestActions = useMemo<MessageActions>(() => ({ ...actions, interactive: canWrite && status === 'agent' }), [actions, canWrite, status]);

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void send(input);
    }
  }

  const pill = conversation ? (status === 'agent' ? { label: 'Assistente online', tone: 'success' } : CONVERSATION_STATUS[conversation.status]) : null;

  return (
    <>
      <header className="topbar">
        <div className="breadcrumb">
          Service desk de TI <ChevronRight size={14} /> <strong>Atendimento</strong>
        </div>
        {pill && (
          <span className={`pill tone-${pill.tone}`}>
            <span className="dot" />
            {status === 'com_analista' && conversation?.analystName ? `Com ${conversation.analystName}` : pill.label}
          </span>
        )}
        <button type="button" className="btn btn-outline" onClick={newConversation} disabled={busy || !detail}>
          <Plus size={15} /> Nova conversa
        </button>
      </header>

      {!detail ? (
        <div className="center-state">
          {loadError ? (
            <div style={{ display: 'grid', gap: 12, justifyItems: 'center' }}>
              <div className="error-banner">{loadError}</div>
              <button type="button" className="btn btn-outline" onClick={() => void load()}>
                Tentar de novo
              </button>
            </div>
          ) : (
            <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span className="spinner" /> Carregando sua conversa…
            </span>
          )}
        </div>
      ) : (
        <div className="chat">
          <div className="messages">
            {detail.messages.length === 0 && (
              <div className="empty-chat">
                <h2>Olá, {user.name.split(' ')[0]}. Como posso ajudar?</h2>
                <span className="muted">Descreva o problema com suas palavras. Eu consulto seus chamados, busco na central de ajuda e chamo um analista se precisar.</span>
                <div className="options">
                  {SUGGESTIONS.map((s) => (
                    <button key={s} type="button" className="option" onClick={() => void send(s)} disabled={!canWrite}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {detail.messages.map((message) => (
              <MessageView key={message.id} message={message} actions={message === lastMessage && message.role === 'agent' ? latestActions : actions} />
            ))}
            {streamText !== null && <StreamingMessage text={streamText} />}
            {sendError && <div className="error-banner">{sendError}</div>}
            <div ref={bottomRef} />
          </div>

          <div className="composer-area">
            {status === 'aguardando_analista' && (
              <div className="paused-banner tone-warning">
                <Headset size={16} /> Um analista vai assumir esta conversa. O assistente está pausado; pode escrever que o analista vai ler.
              </div>
            )}
            {status === 'com_analista' && (
              <div className="paused-banner tone-violet">
                <Headset size={16} /> Você está falando com {conversation?.analystName}, analista do service desk.
              </div>
            )}
            {status === 'encerrada' ? (
              <div className="paused-banner tone-neutral">
                <Lock size={16} /> Esta conversa foi encerrada.
                <button type="button" className="btn btn-primary" style={{ marginLeft: 'auto' }} onClick={newConversation}>
                  Nova conversa
                </button>
              </div>
            ) : (
              <div className="composer">
                <textarea
                  ref={inputRef}
                  rows={1}
                  value={input}
                  autoFocus
                  placeholder={limitReached ? 'Limite de mensagens atingido. Comece uma nova conversa.' : 'Escreva para o Nexo…'}
                  disabled={!canWrite}
                  maxLength={2000}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={onKeyDown}
                />
                <button type="button" className="btn btn-primary" disabled={!canWrite || !input.trim()} onClick={() => void send(input)}>
                  <SendHorizontal size={14} /> Enviar
                </button>
              </div>
            )}
            <div className="composer-meta">
              <span>
                {userCount}/{MAX_MESSAGES} mensagens nesta sessão
              </span>
              <span>Enter envia · Shift+Enter quebra linha</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
