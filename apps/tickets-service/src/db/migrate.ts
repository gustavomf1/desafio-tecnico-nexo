import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { db, pool } from './client.js';
  
await migrate(db, { migrationsFolder: new URL('../../drizzle', import.meta.url).pathname });
console.log('migrations aplicadas');
await pool.end();