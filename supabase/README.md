# Supabase – Conexão e Setup

## 1) Obter URL e Anon Key
- Acesse o dashboard do Supabase, projeto desejado.
- Vá em `Project Settings` → `API`.
- Copie:
  - `VITE_SUPABASE_URL` (ex.: `https://<project-ref>.supabase.co`).
  - `VITE_SUPABASE_ANON_KEY` (chave `anon`).

## 2) Configurar variáveis locais
- Edite o arquivo `.env.local` na raiz do projeto e insira:
```
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-key>
```
- Reinicie o servidor de dev:
```
node .\node_modules\vite\bin\vite.js --host --port 3000
```

## 3) Criar tabela e políticas
- No dashboard do Supabase, abra `SQL Editor`.
- Cole e execute o conteúdo de `supabase/setup.sql`.
- Isso cria a tabela `public.frequencies` com colunas em camelCase e habilita políticas RLS para o papel `anon` (demo).

## 4) Validar no app
- A aba de Frequências passa a salvar e carregar via Supabase.
- Sem as variáveis, o app fica em “modo local” (não persiste no Supabase).

## Notas de segurança
- As políticas `anon` abertas servem para demo/ambiente interno.
- Para produção, use autenticação (Auth) e restrinja `insert/update` a usuários autenticados.

