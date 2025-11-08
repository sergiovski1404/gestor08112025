# Instruções para Executar no Supabase

## Passo a Passo:

1. **Acesse o Dashboard do Supabase**
   - Vá para: https://supabase.com/dashboard/project/pndtpmwtafiehwqusmoh
   - Faça login na sua conta

2. **Execute o SQL no Editor SQL**
   - No menu lateral esquerdo, clique em "SQL Editor"
   - Clique em "New Query"
   - Cole o seguinte código:

```sql
-- Tabela com nomes de colunas compatíveis com o código (camelCase)
create table if not exists public.frequencies (
  "workshopId" text not null,
  "date" date not null,
  "attendance" jsonb not null,
  constraint frequencies_pk primary key ("workshopId", "date")
);

-- Habilitar RLS
alter table public.frequencies enable row level security;

-- Políticas simples para demo: permitir leitura e escrita ao papel anon
create policy if not exists "frequencies select for anon" on public.frequencies
  for select
  to anon
  using (true);

create policy if not exists "frequencies insert for anon" on public.frequencies
  for insert
  to anon
  with check (true);

create policy if not exists "frequencies update for anon" on public.frequencies
  for update
  to anon
  using (true)
  with check (true);
```

3. **Execute o Query**
   - Clique no botão "Run" (▶️) ou pressione Ctrl+Enter

4. **Verifique se a tabela foi criada**
   - Volte ao menu lateral e clique em "Table Editor"
   - Você deve ver a tabela "frequencies" na lista

## O que o script faz:

- ✅ Cria a tabela `public.frequencies` com as colunas:
  - `workshopId` (text) - ID do workshop
  - `date` (date) - Data da frequência
  - `attendance` (jsonb) - Dados de presença em formato JSON

- ✅ Define chave primária composta (`workshopId` + `date`)
- ✅ Habilita Row Level Security (RLS)
- ✅ Cria políticas para permitir operações do usuário anônimo:
  - SELECT: permitir leitura
  - INSERT: permitir inserção
  - UPDATE: permitir atualização

## Validação:

Após executar, teste o app:
1. Abra http://localhost:3000/
2. Crie/salve algumas frequências
3. Os dados devem ser persistidos no Supabase

## Segurança para Produção:

⚠️ **Para ambiente de produção**, recomendo:
- Restringir as políticas RLS para usuários autenticados
- Implementar autenticação JWT
- Validar permissões por usuário/organização