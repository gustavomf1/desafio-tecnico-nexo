import { createInterface } from 'node:readline/promises';
import { createNexoAgent, runTurn, type ChatMessage } from './agent/nexo-agent.js';
import { initialState } from './agent/state.js';
import { loadEnv } from './env.js';
import { createTicketsClient } from './tickets/client.js';

const env = loadEnv();
const email = process.argv[2] ?? 'ana.souza@nexo.com.br';
const employee = await createTicketsClient({ baseUrl: env.TICKETS_URL, token: env.TICKETS_SERVICE_TOKEN }).findEmployeeByEmail(email);
const agent = createNexoAgent(env.ASSIST_MODEL);
const rl = createInterface({ input: process.stdin, output: process.stdout });

let state = initialState();
const history: ChatMessage[] = [];
console.log(`Conectado como ${employee.name}. Ctrl+C para sair.\n`);

for await (const line of rl) {
  const message = line.trim();
  if (!message) continue;
  process.stdout.write(`você > ${message}\nnexo > `);
  const result = await runTurn({
    agent,
    model: env.ASSIST_MODEL,
    employee,
    state,
    history,
    message,
    ticketsUrl: env.TICKETS_URL,
    ticketsToken: env.TICKETS_SERVICE_TOKEN,
    onText: (delta) => process.stdout.write(delta),
  });
  state = result.state;
  history.push({ role: 'user', content: message }, { role: 'assistant', content: result.reply });

  const { decision, steps, guardrails, usage, durationMs } = result.trace;
  console.log('\n\n  ── trace');
  if (decision) console.log(`  entendeu: ${decision.intent} | ação: ${decision.action} | segurança ${decision.confidence} | ${decision.reason}`);
  for (const s of steps) console.log(`  ${s.ok ? '✓' : '✗'} ${s.label}: ${s.summary} (${s.durationMs}ms${s.retries ? `, ${s.retries} nova(s) tentativa(s)` : ''})`);
  for (const g of guardrails) console.log(`  ! ${g}`);
  for (const b of result.blocks) console.log(`  [ui] ${b.type}`);
  console.log(`  ${usage?.inputTokens ?? 0} tokens in / ${usage?.outputTokens ?? 0} out · ${durationMs}ms\n`);
}
