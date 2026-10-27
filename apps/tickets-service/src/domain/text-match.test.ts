import { describe, expect, it } from 'vitest';
import { rankByText, tokenize } from './text-match.js';

describe('tokenize', () => {
  it('ignora acento, caixa e palavras vazias', () => {
    expect(tokenize('Meu notebook NÃO conecta na VPN, erro 809')).toEqual(['notebook', 'conecta', 'vpn', 'erro', '809']);
  });
});

describe('rankByText', () => {
  const docs = ['VPN com erro 809: reinstale o cliente', 'Senha do SAP bloqueada', 'Notebook lento após atualização'];

  it('acha o artigo certo mesmo com variação da palavra', () => {
    const [best] = rankByText(docs, 'não consigo conectar na vpn, dá erro 809', (d) => d, 3);
    expect(best?.item).toBe(docs[0]);
  });

  it('não devolve nada sem palavra em comum', () => {
    expect(rankByText(docs, 'quero férias', (d) => d, 3)).toEqual([]);
  });
});
