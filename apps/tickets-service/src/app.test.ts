import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import { db, pool } from './db/client.js';
import { createServiceDesk } from './service-desk.js';

const token = 'token-de-teste';
const app = buildApp({ serviceDesk: createServiceDesk(db), serviceToken: token, faultRate: 0 });
const headers = { 'x-service-token': token };
let anaId = '';

beforeAll(async () => {
  const res = await app.inject({ method: 'GET', url: '/employees?email=ana.souza@nexo.com.br', headers });
  anaId = res.json().id;
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

describe('privacidade', () => {
  it('lista só os chamados da própria pessoa', async () => {
    const res = await app.inject({ method: 'GET', url: `/employees/${anaId}/tickets?scope=all`, headers });
    const codes = res.json().map((t: { code: string }) => t.code);
    expect(codes).toContain('INC-20311');
    expect(codes).not.toContain('INC-20405');
  });

  it('chamado de outra pessoa responde 404, sem revelar que existe', async () => {
    const res = await app.inject({ method: 'GET', url: `/employees/${anaId}/tickets/INC-20405`, headers });
    expect(res.statusCode).toBe(404);
  });

  it('nem complementar chamado alheio é possível', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/employees/${anaId}/tickets/INC-20405/updates`,
      headers,
      payload: { author: 'funcionario', authorName: 'Ana Souza', body: 'tentando mexer no chamado da Carla' },
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('regras do Anexo A', () => {
  it('chamado aberto há 6 dias com prioridade média aparece vencido', async () => {
    const res = await app.inject({ method: 'GET', url: `/employees/${anaId}/tickets/INC-20311`, headers });
    expect(res.json().sla.overdue).toBe(true);
  });

  it('resolvido há 4 dias pode ser reaberto; há 55 dias não', async () => {
    const recent = await app.inject({ method: 'GET', url: `/employees/${anaId}/tickets/INC-20150`, headers });
    expect(recent.json().reopenable).toBe(true);

    const old = await app.inject({
      method: 'POST',
      url: `/employees/${anaId}/tickets/INC-19877/reopen`,
      headers,
      payload: { reason: 'voltou a acontecer', authorName: 'Ana Souza' },
    });
    expect(old.statusCode).toBe(409);
  });

  it('não complementa chamado resolvido sem reabrir', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/employees/${anaId}/tickets/INC-20150/updates`,
      headers,
      payload: { author: 'funcionario', authorName: 'Ana Souza', body: 'voltou a bloquear' },
    });
    expect(res.statusCode).toBe(409);
  });

  it('acha o chamado parecido para evitar duplicidade', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/employees/${anaId}/tickets/similar?text=${encodeURIComponent('meu notebook está muito lento')}&category=Hardware`,
      headers,
    });
    expect(res.json()[0].ticket.code).toBe('INC-20311');
  });
});

describe('borda do serviço', () => {
  it('recusa chamada sem token', async () => {
    const res = await app.inject({ method: 'GET', url: `/employees/${anaId}/tickets` });
    expect(res.statusCode).toBe(401);
  });

  it('simula a indisponibilidade do legado', async () => {
    const flaky = buildApp({ serviceDesk: createServiceDesk(db), serviceToken: token, faultRate: 1 });
    const res = await flaky.inject({ method: 'GET', url: `/employees/${anaId}/tickets`, headers });
    expect(res.statusCode).toBe(503);
    await flaky.close();
  });
});
