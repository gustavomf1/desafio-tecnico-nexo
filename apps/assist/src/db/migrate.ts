import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { loadEnv } from '../env.js';
import { createDb } from './client.js';

const env = loadEnv();
const { db, pool } = createDb(env.ASSIST_DATABASE_URL);
await migrate(db, { migrationsFolder: new URL('../../drizzle', import.meta.url).pathname, migrationsTable: env.ASSIST_MIGRATIONS_TABLE });
console.log('migrations aplicadas');
await pool.end();
