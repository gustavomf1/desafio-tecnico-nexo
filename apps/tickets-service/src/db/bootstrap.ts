import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { db, pool } from './client.js';

await migrate(db, { migrationsFolder: new URL('../../drizzle', import.meta.url).pathname });
const result = await db.execute<{ n: string }>(sql`select count(*) as n from employees`);

if (Number(result.rows[0]!.n) === 0) {
  console.log('banco vazio: carregando dados de exemplo');
  await import('./seed.js');
} else {
  console.log('migrations aplicadas; dados de exemplo já existem');
  await pool.end();
}
