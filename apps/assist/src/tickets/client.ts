import type { Article, Employee, NewTicket, Ticket, TicketDetail } from './types.js';

export class TicketsApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }

  get retryable(): boolean {
    return this.status === 503 || this.status === 0;
  }
}

export type RetryInfo = { path: string; attempt: number; status: number };

export type TicketsClientOptions = {
  baseUrl: string;
  token: string;
  maxAttempts?: number;
  baseDelayMs?: number;
  // Chamado a cada falha temporária; o trace usa isso para mostrar "sistema indisponível, tentativa N".
  onRetry?: (info: RetryInfo) => void;
  fetchFn?: typeof fetch;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function createTicketsClient({ baseUrl, token, maxAttempts = 4, baseDelayMs = 250, onRetry, fetchFn = fetch }: TicketsClientOptions) {
  async function once<T>(method: string, path: string, body?: unknown): Promise<T> {
    let res: Response;
    try {
      res = await fetchFn(`${baseUrl}${path}`, {
        method,
        headers: { 'x-service-token': token, ...(body ? { 'content-type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(5000),
      });
    } catch {
      // Rede caiu ou estourou o timeout: tratamos igual a um 503.
      throw new TicketsApiError(0, 'network', 'Sistema de chamados não respondeu');
    }
    const data = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
    if (!res.ok) throw new TicketsApiError(res.status, data.error ?? 'unknown', data.message ?? `HTTP ${res.status}`);
    return data as T;
  }

  // O legado fica fora do ar por alguns segundos: tentamos de novo com espera crescente (250ms, 500ms, 1s).
  // Erros de regra (404, 409, 400) não adiantam repetir e sobem direto.
  async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
    for (let attempt = 1; ; attempt++) {
      try {
        return await once<T>(method, path, body);
      } catch (err) {
        if (!(err instanceof TicketsApiError) || !err.retryable || attempt >= maxAttempts) throw err;
        onRetry?.({ path, attempt, status: err.status });
        await sleep(baseDelayMs * 2 ** (attempt - 1));
      }
    }
  }

  const q = (params: Record<string, string | undefined>) => {
    const entries = Object.entries(params).filter((e): e is [string, string] => e[1] !== undefined);
    return new URLSearchParams(entries).toString();
  };
  const emp = (employeeId: string) => `/employees/${encodeURIComponent(employeeId)}`;

  return {
    findEmployeeByEmail: (email: string) => request<Employee>('GET', `/employees?${q({ email })}`),
    getEmployee: (employeeId: string) => request<Employee>('GET', emp(employeeId)),
    listTickets: (employeeId: string, scope: 'open' | 'all' = 'open') => request<Ticket[]>('GET', `${emp(employeeId)}/tickets?${q({ scope })}`),
    getTicket: (employeeId: string, code: string) => request<TicketDetail>('GET', `${emp(employeeId)}/tickets/${encodeURIComponent(code)}`),
    findSimilar: (employeeId: string, text: string, category?: string) =>
      request<Array<{ ticket: Ticket; score: number }>>('GET', `${emp(employeeId)}/tickets/similar?${q({ text, category })}`),
    createTicket: (employeeId: string, input: NewTicket) => request<Ticket>('POST', `${emp(employeeId)}/tickets`, input),
    addUpdate: (employeeId: string, code: string, body: string, authorName: string) =>
      request<Ticket>('POST', `${emp(employeeId)}/tickets/${encodeURIComponent(code)}/updates`, { author: 'funcionario', authorName, body }),
    reopen: (employeeId: string, code: string, reason: string, authorName: string) =>
      request<Ticket>('POST', `${emp(employeeId)}/tickets/${encodeURIComponent(code)}/reopen`, { reason, authorName }),
    escalate: (employeeId: string, code: string, summary: string) =>
      request<Ticket>('POST', `${emp(employeeId)}/tickets/${encodeURIComponent(code)}/escalate`, { summary }),
    searchArticles: (query: string, limit = 3) => request<Array<{ article: Article; score: number }>>('GET', `/kb/search?${q({ q: query, limit: String(limit) })}`),
  };
}

export type TicketsClient = ReturnType<typeof createTicketsClient>;
