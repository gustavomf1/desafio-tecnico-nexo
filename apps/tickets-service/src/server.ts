import { buildApp } from './app.js';
import { db, pool } from './db/client.js';
import { env } from './env.js';
import { createServiceDesk } from './service-desk.js';

const app = buildApp({
  serviceDesk: createServiceDesk(db),
  serviceToken: env.TICKETS_SERVICE_TOKEN,
  faultRate: env.TICKETS_FAULT_RATE,
  logger: true,
});

const shutdown = async () => {
  await app.close();
  await pool.end();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

await app.listen({ port: env.PORT ?? env.TICKETS_PORT, host: '::' });
