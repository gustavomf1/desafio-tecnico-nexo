import Fastify from 'fastify';
import { env } from './env.js';

const app = Fastify({ logger: true });
  
app.get('/health', async () => ({ ok: true }));
 
await app.listen({ port: env.TICKETS_PORT, host: '0.0.0.0' });