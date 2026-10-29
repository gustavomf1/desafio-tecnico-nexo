import { describe, expect, it, vi } from 'vitest';
import { TicketsApiError, createTicketsClient, type RetryInfo } from './client.js';

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function clientWith(responses: Array<Response | Error>) {
  const fetchFn = vi.fn(async () => {
    const next = responses.shift();
    if (!next) throw new Error('sem resposta configurada');
    if (next instanceof Error) throw next;
    return next;
  });
  const retries: RetryInfo[] = [];
  const client = createTicketsClient({ baseUrl: 'http://x', token: 't', baseDelayMs: 1, fetchFn, onRetry: (r) => retries.push(r) });
  return { client, fetchFn, retries };
}

describe('tickets client', () => {
  it('manda o token de serviço em toda chamada', async () => {
    const { client, fetchFn } = clientWith([json(200, [])]);
    await client.listTickets('emp-1');
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://x/employees/emp-1/tickets?scope=open');
    expect((init.headers as Record<string, string>)['x-service-token']).toBe('t');
  });

  it('tenta de novo quando o legado responde 503 e avisa cada tentativa', async () => {
    const { client, retries } = clientWith([json(503, { error: 'unavailable' }), json(503, { error: 'unavailable' }), json(200, [{ code: 'INC-1' }])]);
    const result = await client.listTickets('emp-1');
    expect(result).toEqual([{ code: 'INC-1' }]);
    expect(retries.map((r) => r.attempt)).toEqual([1, 2]);
  });

  it('trata falha de rede como indisponibilidade temporária', async () => {
    const { client, retries } = clientWith([new TypeError('fetch failed'), json(200, [])]);
    await client.listTickets('emp-1');
    expect(retries[0]?.status).toBe(0);
  });

  it('desiste depois do limite de tentativas', async () => {
    const { client, fetchFn } = clientWith(Array.from({ length: 4 }, () => json(503, { error: 'unavailable', message: 'fora' })));
    await expect(client.listTickets('emp-1')).rejects.toMatchObject({ status: 503 });
    expect(fetchFn).toHaveBeenCalledTimes(4);
  });

  it('não repete erro de regra (409) e repassa a mensagem do serviço', async () => {
    const { client, fetchFn } = clientWith([json(409, { error: 'invalid_state', message: 'reabra antes de complementar' })]);
    const err = await client.addUpdate('emp-1', 'INC-1', 'mais info', 'Ana').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(TicketsApiError);
    expect((err as TicketsApiError).message).toBe('reabra antes de complementar');
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});
