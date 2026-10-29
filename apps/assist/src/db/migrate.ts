import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { loadEnv } from '../env.js';
import { createDb } from './client.js';

const { db, pool } = createDb(loadEnv().ASSIST_DATABASE_URL);
await migrate(db, { migrationsFolder: new URL('../../drizzle', import.meta.url).pathname });
console.log('migrations aplicadas');
await pool.end();
