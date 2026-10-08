import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';
const { Pool }=pg;
const pool=new Pool({connectionString:process.env.DATABASE_URL});
try {
  await pool.query('CREATE TABLE IF NOT EXISTS schema_migrations(name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
  const dir=path.resolve('migrations');
  for(const name of (await readdir(dir)).filter(x=>x.endsWith('.sql')).sort()){
    const exists=await pool.query('SELECT 1 FROM schema_migrations WHERE name=$1',[name]);if(exists.rowCount)continue;
    const client=await pool.connect();try{await client.query('BEGIN');await client.query(await readFile(path.join(dir,name),'utf8'));await client.query('INSERT INTO schema_migrations(name) VALUES($1)',[name]);await client.query('COMMIT');console.log(`applied ${name}`);}catch(err){await client.query('ROLLBACK');throw err;}finally{client.release();}
  }
} finally { await pool.end(); }
