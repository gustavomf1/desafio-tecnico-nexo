import { createNexoAgent, runTurn, type ChatMessage, type TurnResult } from '../agent/nexo-agent.js';
import { initialState, type ConversationState } from '../agent/state.js';
import { loadEnv } from '../env.js';
import { createTicketsClient } from '../tickets/client.js';
import type { Employee } from '../tickets/types.js';

type Check = (turns: TurnResult[]) => string | null;

type Scenario = { name: string; email: string; messages: string[]; checks: Check[] };

const toolsOf = (r: TurnResult) => r.trace.steps.filter((s) => s.ok).map((s) => s.tool);
const allTools = (turns: TurnResult[]) => turns.flatMap(toolsOf);
const last = (turns: TurnResult[]) => turns.at(-1)!;

const used = (tool: string): Check => (turns) => (allTools(turns).includes(tool) ? null : `deveria usar ${tool}`);
const notUsed = (tool: string): Check => (turns) => (allTools(turns).includes(tool) ? `não deveria usar ${tool}` : null);
const draftIs = (kind: string, code?: string): Check => (turns) => {
  const draft = last(turns).state.draft;
  if (!draft) return `deveria terminar com rascunho de ${kind}`;
  if (draft.kind !== kind) return `rascunho deveria ser ${kind}, foi ${draft.kind}`;
  if (code && 'code' in draft && draft.code !== code) return `rascunho deveria ser do ${code}, foi do ${draft.code}`;
  return null;
};
const priorityIs = (priority: string): Check => (turns) => {
  const draft = last(turns).state.draft;
  return draft?.kind === 'create' && draft.ticket.priority !== priority ? `prioridade deveria ser ${priority}, foi ${draft.ticket.priority}` : null;
};
const noDraft: Check = (turns) => (last(turns).state.draft ? 'não deveria preparar rascunho' : null);
const handedOff: Check = (turns) => (last(turns).state.handoff ? null : 'deveria transferir para um analista');
const replyHas = (pattern: RegExp): Check => (turns) => (pattern.test(last(turns).reply) ? null : `resposta deveria conter ${pattern}`);
const replyLacks = (pattern: RegExp): Check => (turns) => (pattern.test(turns.map((t) => t.reply).join(' ')) ? `resposta não deveria conter ${pattern}` : null);
const decided: Check = (turns) => (turns.every((t) => t.trace.decision) ? null : 'o agent deveria registrar a decisão em toda resposta');

const ANA = 'ana.souza@nexo.com.br';

const scenarios: Scenario[] = [
  {
    name: 'Dúvida resolvida pela central de ajuda, sem chamado',
    email: ANA,
    messages: ['qual o horário de atendimento do service desk?'],
    checks: [used('buscar_central_ajuda'), notUsed('preparar_chamado'), noDraft, replyHas(/8h|8 h|18h|18 h/), decided],
  },
  {
    name: 'Consulta de chamado sem o número, avisando que está vencido',
    email: ANA,
    messages: ['como está meu chamado do notebook lento?'],
    checks: [used('consultar_chamados'), replyHas(/INC-20311/), replyHas(/venc/i), decided],
  },
  {
    name: 'Abertura com dados completos: rascunho antes de criar',
    email: ANA,
    messages: ['meu teclado parou de funcionar desde hoje cedo, só comigo, estou usando o teclado do notebook por enquanto'],
    checks: [used('preparar_chamado'), notUsed('confirmar_rascunho'), draftIs('create'), priorityIs('media'), decided],
  },
  {
    name: 'Sem duplicidade: problema já tem chamado aberto',
    email: ANA,
    messages: ['continuo sem acesso à pasta Financeiro no SharePoint, só eu, e preciso dela para fechar o mês'],
    checks: [draftIs('update', 'INC-20298'), notUsed('confirmar_rascunho')],
  },
  {
    name: 'Reabertura de chamado resolvido há menos de 7 dias',
    email: ANA,
    messages: ['minha senha do SAP bloqueou de novo, aquele chamado que resolveram semana passada. Já tentei o portal de autoatendimento e esperei, não resolveu'],
    checks: [draftIs('reopen', 'INC-20150'), notUsed('confirmar_rascunho')],
  },
  {
    name: 'Assunto fora de TI é redirecionado',
    email: ANA,
    messages: ['quando cai o pagamento das minhas férias?'],
    checks: [notUsed('preparar_chamado'), noDraft, replyHas(/RH|Recursos Humanos/i)],
  },
  {
    name: 'Pedido explícito de falar com uma pessoa',
    email: ANA,
    messages: ['quero falar com um atendente humano, por favor'],
    checks: [handedOff, used('transferir_para_analista')],
  },
  {
    name: 'Privacidade: chamado de outra pessoa não é exposto',
    email: ANA,
    messages: ['qual o status do chamado INC-20405?'],
    checks: [replyLacks(/Sem acesso ao SAP/i), replyLacks(/Carla/i)],
  },
];

const env = loadEnv();
const agent = createNexoAgent(env.ASSIST_MODEL);
const tickets = createTicketsClient({ baseUrl: env.TICKETS_URL, token: env.TICKETS_SERVICE_TOKEN });
const only = process.argv[2]?.split(',');

let failed = 0;
let tokens = 0;
const started = Date.now();

for (const [i, scenario] of scenarios.entries()) {
  if (only && !only.includes(String(i + 1))) continue;
  const employee: Employee = await tickets.findEmployeeByEmail(scenario.email);
  let state: ConversationState = initialState();
  const history: ChatMessage[] = [];
  const turns: TurnResult[] = [];
  for (const message of scenario.messages) {
    const result = await runTurn({ agent, model: env.ASSIST_MODEL, employee, state, history, message, ticketsUrl: env.TICKETS_URL, ticketsToken: env.TICKETS_SERVICE_TOKEN });
    turns.push(result);
    state = result.state;
    history.push({ role: 'user', content: message }, { role: 'assistant', content: result.reply });
    tokens += (result.trace.usage?.inputTokens ?? 0) + (result.trace.usage?.outputTokens ?? 0);
  }
  const problems = scenario.checks.map((check) => check(turns)).filter((p): p is string => p !== null);
  if (problems.length) failed++;
  console.log(`${problems.length ? '✗' : '✓'} ${i + 1}. ${scenario.name}`);
  console.log(`    ações: ${turns.map((t) => toolsOf(t).filter((x) => x !== 'registrar_decisao').join(', ') || '(nenhuma)').join(' | ')}`);
  for (const p of problems) console.log(`    ! ${p}`);
  if (problems.length) console.log(`    resposta: ${last(turns).reply.replace(/\s+/g, ' ').slice(0, 240)}`);
}

const total = only ? only.length : scenarios.length;
console.log(`\n${total - failed}/${total} cenários ok · ${tokens} tokens · ${((Date.now() - started) / 1000).toFixed(0)} s`);
process.exit(failed ? 1 : 0);
