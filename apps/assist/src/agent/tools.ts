import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { TicketsApiError } from '../tickets/client.js';
import { CATEGORIES, PRIORITIES, TICKET_TYPES, type Ticket } from '../tickets/types.js';
import { HANDOFF_REASONS, PRIORITY_INFO, type Draft } from './state.js';
import { turnFrom, type TurnContext } from './turn-context.js';

export const DUPLICATE_THRESHOLD = 0.5;

type Failure = { ok: false; error: string };

async function traced(turn: TurnContext, tool: string, label: string, input: unknown, run: () => Promise<{ result: object; summary: string }>): Promise<object | Failure> {
  const started = Date.now();
  turn.pendingRetries = 0;
  try {
    const { result, summary } = await run();
    turn.steps.push({ tool, label, input, ok: true, summary, durationMs: Date.now() - started, retries: turn.pendingRetries });
    return result;
  } catch (err) {
    const error =
      err instanceof TicketsApiError
        ? err.retryable
          ? 'O sistema de chamados está indisponível no momento. Tente de novo em alguns instantes.'
          : err.message
        : 'Erro inesperado ao executar a ação.';
    turn.steps.push({ tool, label, input, ok: false, summary: error, durationMs: Date.now() - started, retries: turn.pendingRetries });
    return { ok: false, error };
  }
}

const brief = (t: Ticket) => ({
  code: t.code,
  title: t.title,
  status: t.status,
  priority: t.priority,
  category: t.category,
  updatedAt: t.updatedAt,
  prazo: t.sla.dueAt,
  vencido: t.sla.overdue,
  podeReabrir: t.reopenable,
});

const newDraftId = (turn: TurnContext) => `d${turn.state.turn}-${Math.random().toString(36).slice(2, 6)}`;

export const registrarDecisao = createTool({
  id: 'registrar_decisao',
  description:
    'Registra o que você entendeu e o que vai fazer nesta mensagem. Chame UMA vez por mensagem do funcionário, antes ou junto com as outras ferramentas.',
  inputSchema: z.object({
    intent: z.string().describe('O que o funcionário quer, em poucas palavras'),
    action: z.string().describe('A ação que você vai tomar'),
    confidence: z.number().min(0).max(1).describe('Sua segurança sobre a decisão, de 0 a 1'),
    reason: z.string().describe('Por que essa ação, citando a regra do service desk quando houver'),
  }),
  execute: async (input, ctx) => {
    const turn = turnFrom(ctx);
    turn.decision = input;
    return { ok: true };
  },
});

export const consultarChamados = createTool({
  id: 'consultar_chamados',
  description: 'Lista os chamados do funcionário logado. Use "open" para os em aberto e "all" para incluir resolvidos e fechados.',
  inputSchema: z.object({ scope: z.enum(['open', 'all']).default('open') }),
  execute: async ({ scope }, ctx) => {
    const turn = turnFrom(ctx);
    return traced(turn, 'consultar_chamados', 'Consultou seus chamados', { scope }, async () => {
      const tickets = await turn.tickets.listTickets(turn.employee.id, scope);
      if (tickets.length > 0) turn.blocks.push({ type: 'tickets', tickets });
      const overdue = tickets.filter((t) => t.sla.overdue).length;
      return { result: { chamados: tickets.map(brief) }, summary: `${tickets.length} chamado(s)${overdue ? `, ${overdue} vencido(s)` : ''}` };
    });
  },
});

export const detalharChamado = createTool({
  id: 'detalhar_chamado',
  description: 'Mostra um chamado do funcionário com o histórico de atualizações.',
  inputSchema: z.object({ code: z.string().describe('Código, por exemplo INC-20311') }),
  execute: async ({ code }, ctx) => {
    const turn = turnFrom(ctx);
    return traced(turn, 'detalhar_chamado', `Abriu o chamado ${code.toUpperCase()}`, { code }, async () => {
      const t = await turn.tickets.getTicket(turn.employee.id, code);
      turn.blocks.push({ type: 'tickets', tickets: [t] });
      return {
        result: { ...brief(t), descricao: t.description, atualizacoes: t.updates.slice(-5) },
        summary: `${t.status}${t.sla.overdue ? ', vencido' : ''}, ${t.updates.length} atualização(ões)`,
      };
    });
  },
});

export const buscarCentralAjuda = createTool({
  id: 'buscar_central_ajuda',
  description: 'Busca artigos da central de ajuda. Use antes de abrir chamado para dúvidas e problemas comuns.',
  inputSchema: z.object({ query: z.string().min(2).describe('Palavras-chave do problema') }),
  execute: async ({ query }, ctx) => {
    const turn = turnFrom(ctx);
    return traced(turn, 'buscar_central_ajuda', 'Buscou na central de ajuda', { query }, async () => {
      const hits = await turn.tickets.searchArticles(query, 3);
      const relevant = hits.filter((h) => h.score >= 0.3);
      return {
        result: { artigos: relevant.map((h) => ({ titulo: h.article.title, texto: h.article.body, relevancia: Number(h.score.toFixed(2)) })) },
        summary: relevant.length ? `Encontrou "${relevant[0]!.article.title}"` : 'Nenhum artigo relevante',
      };
    });
  },
});

export const prepararChamado = createTool({
  id: 'preparar_chamado',
  description:
    'Monta o rascunho de um chamado novo para o funcionário conferir. Verifica sozinho se já existe chamado aberto sobre o mesmo problema; nesse caso o rascunho vira uma atualização do chamado existente. Só chame quando tiver todas as informações.',
  inputSchema: z.object({
    type: z.enum(TICKET_TYPES).describe('INC quando algo parou ou não funciona; REQ para pedido de acesso, equipamento ou software'),
    category: z.enum(CATEGORIES),
    priority: z.enum(PRIORITIES),
    priorityReason: z.string().describe('Impacto (quantas pessoas) e urgência (compromisso em risco) que justificam a prioridade'),
    title: z.string().min(5).max(120),
    description: z.string().min(10).max(2000).describe('Descrição completa para o analista não precisar perguntar de novo'),
    affected: z.string().min(2).max(120).describe('Quem é afetado: a própria pessoa, uma equipe, a empresa'),
    ignorarDuplicado: z.boolean().default(false).describe('true só se o funcionário disse que NÃO é o mesmo problema do chamado existente'),
  }),
  execute: async ({ priorityReason, ignorarDuplicado, ...ticket }, ctx) => {
    const turn = turnFrom(ctx);
    return traced(turn, 'preparar_chamado', 'Preparou o rascunho do chamado', ticket, async () => {
      if (!ignorarDuplicado) {
        const similar = await turn.tickets.findSimilar(turn.employee.id, ticket.title, ticket.category);
        const match = similar.find((s) => s.score >= DUPLICATE_THRESHOLD);
        if (match) {
          const existing = match.ticket;
          const kind = existing.status === 'resolvido' || existing.status === 'fechado' ? 'reopen' : 'update';
          const draft: Draft = { id: newDraftId(turn), kind, createdTurn: turn.state.turn, code: existing.code, title: existing.title, text: ticket.description, duplicate: true };
          turn.state.draft = draft;
          turn.blocks.push({ type: 'draft', draft, duplicateOf: existing });
          turn.guardrails.push(`Sem duplicidade: já existe ${existing.code} sobre o mesmo problema (similaridade ${match.score.toFixed(2)}), o rascunho virou ${kind === 'update' ? 'atualização' : 'reabertura'}.`);
          return {
            result: { draftId: draft.id, duplicado: brief(existing), proposta: kind === 'update' ? 'complementar o chamado existente' : 'reabrir o chamado resolvido' },
            summary: `Encontrou ${existing.code} sobre o mesmo problema`,
          };
        }
      } else {
        turn.guardrails.push('Duplicidade ignorada porque o funcionário disse que é outro problema.');
      }
      const sla = PRIORITY_INFO[ticket.priority].sla;
      const draft: Draft = { id: newDraftId(turn), kind: 'create', createdTurn: turn.state.turn, ticket, priorityReason, slaRule: sla };
      turn.state.draft = draft;
      turn.blocks.push({ type: 'draft', draft });
      return {
        result: { draftId: draft.id, rascunho: { ...ticket, prazo: sla } },
        summary: `${ticket.type} · ${ticket.category} · ${PRIORITY_INFO[ticket.priority].label} (${sla})`,
      };
    });
  },
});

export const prepararComplemento = createTool({
  id: 'preparar_complemento',
  description: 'Monta o rascunho de uma informação nova para um chamado existente do funcionário. Se o chamado foi resolvido há até 7 dias, o rascunho é de reabertura.',
  inputSchema: z.object({ code: z.string(), text: z.string().min(3).describe('O que será acrescentado ao chamado') }),
  execute: async ({ code, text }, ctx) => {
    const turn = turnFrom(ctx);
    return traced(turn, 'preparar_complemento', `Preparou complemento do ${code.toUpperCase()}`, { code, text }, async () => {
      const t = await turn.tickets.getTicket(turn.employee.id, code);
      const closed = t.status === 'resolvido' || t.status === 'fechado';
      if (closed && !t.reopenable) {
        turn.guardrails.push(`${t.code} foi encerrado há mais de 7 dias e não pode ser reaberto; o caminho é um chamado novo.`);
        return { result: { ok: false, error: `O chamado ${t.code} foi encerrado há mais de 7 dias. É preciso abrir um chamado novo.` }, summary: 'Fora da janela de reabertura' };
      }
      const draft: Draft = { id: newDraftId(turn), kind: closed ? 'reopen' : 'update', createdTurn: turn.state.turn, code: t.code, title: t.title, text, duplicate: false };
      turn.state.draft = draft;
      turn.blocks.push({ type: 'draft', draft, duplicateOf: t });
      return { result: { draftId: draft.id, tipo: draft.kind === 'reopen' ? 'reabertura' : 'complemento', chamado: brief(t) }, summary: draft.kind === 'reopen' ? 'Rascunho de reabertura' : 'Rascunho de complemento' };
    });
  },
});

export const confirmarRascunho = createTool({
  id: 'confirmar_rascunho',
  description: 'Executa o rascunho (cria, complementa ou reabre o chamado). Só chame depois que o funcionário confirmou explicitamente o rascunho mostrado.',
  inputSchema: z.object({ draftId: z.string() }),
  execute: async ({ draftId }, ctx) => {
    const turn = turnFrom(ctx);
    const draft = turn.state.draft;
    if (!draft || draft.id !== draftId) {
      turn.guardrails.push('Bloqueado: confirmação de um rascunho que não existe ou foi substituído.');
      return { ok: false, error: 'Rascunho não encontrado. Prepare o rascunho de novo.' };
    }
    if (draft.createdTurn >= turn.state.turn) {
      turn.guardrails.push('Bloqueado: tentativa de executar o rascunho antes do funcionário confirmar.');
      return { ok: false, error: 'O funcionário ainda não viu este rascunho. Mostre e peça confirmação.' };
    }
    const label = draft.kind === 'create' ? 'Criou o chamado' : draft.kind === 'update' ? `Complementou o ${draft.code}` : `Reabriu o ${draft.code}`;
    return traced(turn, 'confirmar_rascunho', label, { draftId, kind: draft.kind }, async () => {
      const emp = turn.employee;
      const ticket =
        draft.kind === 'create'
          ? await turn.tickets.createTicket(emp.id, draft.ticket)
          : draft.kind === 'update'
            ? await turn.tickets.addUpdate(emp.id, draft.code, draft.text, emp.name)
            : await turn.tickets.reopen(emp.id, draft.code, draft.text, emp.name);
      turn.state.draft = null;
      turn.blocks.push({ type: 'ticket', ticket, event: draft.kind === 'create' ? 'criado' : draft.kind === 'update' ? 'atualizado' : 'reaberto' });
      if (ticket.priority === 'critica' && !turn.state.handoff) {
        turn.state.handoff = { reason: 'critico', summary: `Chamado crítico ${ticket.code}: ${ticket.title}`, ticketCode: ticket.code, at: new Date().toISOString() };
        turn.blocks.push({ type: 'handoff', handoff: turn.state.handoff });
        turn.guardrails.push(`Chamado crítico ${ticket.code}: conversa transferida para um analista automaticamente.`);
      }
      return { result: { ok: true, chamado: brief(ticket), transferido: turn.state.handoff !== null }, summary: `${ticket.code} · prazo ${ticket.sla.rule}` };
    });
  },
});

export const oferecerOpcoes = createTool({
  id: 'oferecer_opcoes',
  description: 'Mostra botões de resposta rápida para o funcionário. Use ao fazer uma pergunta com poucas respostas possíveis (quem é afetado, falar com analista, prioridade). Não use para escolher chamado: a lista de chamados já é clicável.',
  inputSchema: z.object({ question: z.string(), options: z.array(z.string().max(60)).min(2).max(5) }),
  execute: async ({ question, options }, ctx) => {
    const turn = turnFrom(ctx);
    turn.blocks.push({ type: 'options', question, options });
    return { ok: true };
  },
});

export const transferirParaAnalista = createTool({
  id: 'transferir_para_analista',
  description:
    'Transfere a conversa para um analista humano. Use quando o funcionário pedir, em caso crítico, em chamado vencido que ele quer acelerar, ou quando você não tiver segurança sobre o que fazer.',
  inputSchema: z.object({
    reason: z.enum(HANDOFF_REASONS),
    summary: z.string().min(10).max(1000).describe('Resumo do caso para o analista não precisar perguntar tudo de novo'),
    ticketCode: z.string().optional().describe('Chamado relacionado, se houver'),
  }),
  execute: async ({ reason, summary, ticketCode }, ctx) => {
    const turn = turnFrom(ctx);
    return traced(turn, 'transferir_para_analista', 'Transferiu para um analista', { reason, ticketCode }, async () => {
      if (ticketCode) await turn.tickets.escalate(turn.employee.id, ticketCode, summary);
      turn.state.handoff = { reason, summary, ticketCode: ticketCode?.toUpperCase() ?? null, at: new Date().toISOString() };
      turn.blocks.push({ type: 'handoff', handoff: turn.state.handoff });
      return { result: { ok: true }, summary: `Motivo: ${reason}${ticketCode ? `, chamado ${ticketCode.toUpperCase()}` : ''}` };
    });
  },
});

export const nexoTools = {
  registrar_decisao: registrarDecisao,
  consultar_chamados: consultarChamados,
  detalhar_chamado: detalharChamado,
  buscar_central_ajuda: buscarCentralAjuda,
  preparar_chamado: prepararChamado,
  preparar_complemento: prepararComplemento,
  confirmar_rascunho: confirmarRascunho,
  oferecer_opcoes: oferecerOpcoes,
  transferir_para_analista: transferirParaAnalista,
};
