-- Supabase setup: tabela de frequências e políticas RLS

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
-- Observação: para produção, restrinja conforme autenticação de usuários
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

