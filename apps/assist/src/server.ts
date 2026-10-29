import { createNexoAgent, runTurn } from './agent/nexo-agent.js';
import { buildApp } from './app.js';
import { createConversationStore } from './conversations.js';
import { createDb } from './db/client.js';
import { loadEnv } from './env.js';
import { createTicketsClient } from './tickets/client.js';

const env = loadEnv();
const { db, pool } = createDb(env.ASSIST_DATABASE_URL);
const agent = createNexoAgent(env.ASSIST_MODEL);

const app = buildApp({
  store: createConversationStore(db),
  tickets: createTicketsClient({ baseUrl: env.TICKETS_URL, token: env.TICKETS_SERVICE_TOKEN }),
  sessionSecret: env.ASSIST_SESSION_SECRET,
  webOrigin: env.ASSIST_WEB_ORIGIN,
  logger: true,
  runTurn: (input) =>
    runTurn({ ...input, agent, model: env.ASSIST_MODEL, ticketsUrl: env.TICKETS_URL, ticketsToken: env.TICKETS_SERVICE_TOKEN }),
});

const shutdown = async () => {
  await app.close();
  await pool.end();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

await app.listen({ port: env.ASSIST_PORT, host: '0.0.0.0' });
