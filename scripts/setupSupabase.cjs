#!/usr/bin/env node
// Executa o SQL de setup no banco do Supabase usando conexão Postgres

const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const { Client } = require('pg');

// Carregar variáveis de .env.setup (somente para este script)
const envSetupPath = path.resolve(process.cwd(), '.env.setup');
if (fs.existsSync(envSetupPath)) {
  dotenv.config({ path: envSetupPath });
}

const dbUrl = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
if (!dbUrl) {
  console.error('ERRO: Defina SUPABASE_DB_URL em .env.setup com a conexão do banco do Supabase.');
  console.error('Exemplo: postgresql://postgres:<SENHA>@db.<project-ref>.supabase.co:5432/postgres');
  process.exit(1);
}

const sqlFile = path.resolve(process.cwd(), 'supabase', 'setup.sql');
if (!fs.existsSync(sqlFile)) {
  console.error('ERRO: Arquivo supabase/setup.sql não encontrado.');
  process.exit(1);
}

const sql = fs.readFileSync(sqlFile, 'utf-8');

(async () => {
  const client = new Client({ connectionString: dbUrl });
  try {
    console.log('Conectando ao banco...');
    await client.connect();
    console.log('Aplicando schema do Supabase...');
    await client.query(sql);
    console.log('✅ Schema aplicado com sucesso.');
  } catch (err) {
    console.error('❌ Falha ao aplicar schema:', err.message);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
})();

