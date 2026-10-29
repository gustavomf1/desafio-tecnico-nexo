import type { Conversation, Message, User } from './types';

const BASE = process.env.NEXT_PUBLIC_ASSIST_URL ?? 'http://localhost:4000';
const TOKEN_KEY = 'nexo.token';
const USER_KEY = 'nexo.user';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

function storages(): Storage[] {
  return typeof window === 'undefined' ? [] : [window.localStorage, window.sessionStorage];
}

export function getSession(): { token: string; user: User } | null {
  for (const s of storages()) {
    const token = s.getItem(TOKEN_KEY);
    const user = s.getItem(USER_KEY);
    if (token && user) return { token, user: JSON.parse(user) as User };
  }
  return null;
}

export function saveSession(token: string, user: User, remember: boolean) {
  clearSession();
  const s = remember ? window.localStorage : window.sessionStorage;
  s.setItem(TOKEN_KEY, token);
  s.setItem(USER_KEY, JSON.stringify(user));
}

export function clearSession() {
  for (const s of storages()) {
    s.removeItem(TOKEN_KEY);
    s.removeItem(USER_KEY);
  }
}

function headers(json: boolean): HeadersInit {
  const session = getSession();
  return { ...(json ? { 'content-type': 'application/json' } : {}), ...(session ? { authorization: `Bearer ${session.token}` } : {}) };
}

async function failure(res: Response): Promise<ApiError> {
  const body = (await res.json().catch(() => ({}))) as { message?: string };
  if (res.status === 401 && typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
    clearSession();
    window.location.href = '/login';
  }
  return new ApiError(res.status, body.message ?? 'Não foi possível falar com o Nexo Assist.');
}

export async function api<T>(path: string, init: { method?: 'GET' | 'POST'; body?: unknown } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method: init.method ?? 'GET',
      headers: headers(init.body !== undefined),
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'Sem conexão com o Nexo Assist. Verifique sua rede.');
  }
  if (!res.ok) throw await failure(res);
  return (await res.json()) as T;
}

export type StreamHandlers = {
  onUser: (message: Message) => void;
  onText: (delta: string) => void;
  onDone: (result: { message: Message | null; conversation: Conversation }) => void;
  onError: (message: string) => void;
};

export async function sendMessage(conversationId: string, content: string, handlers: StreamHandlers): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`${BASE}/conversations/${conversationId}/messages`, { method: 'POST', headers: headers(true), body: JSON.stringify({ content }) });
  } catch {
    handlers.onError('Sem conexão com o Nexo Assist. Verifique sua rede.');
    return;
  }
  if (!res.ok || !res.body) {
    handlers.onError((await failure(res)).message);
    return;
  }

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  let finished = false;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    let boundary = buffer.indexOf('\n\n');
    while (boundary !== -1) {
      const raw = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      boundary = buffer.indexOf('\n\n');
      const event = /^event: (.+)$/m.exec(raw)?.[1];
      const data = /^data: (.+)$/m.exec(raw)?.[1];
      if (!event || !data) continue;
      const payload = JSON.parse(data);
      if (event === 'user') handlers.onUser(payload);
      if (event === 'text') handlers.onText(payload.delta);
      if (event === 'done') {
        finished = true;
        handlers.onDone(payload);
      }
      if (event === 'error') {
        finished = true;
        handlers.onError(payload.message);
      }
    }
  }
  if (!finished) handlers.onError('A resposta foi interrompida. Tente de novo.');
}
