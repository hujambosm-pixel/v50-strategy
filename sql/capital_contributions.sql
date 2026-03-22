-- capital_contributions: aportaciones de capital, retiradas y dividendos
-- Ejecutar en Supabase SQL Editor

create table if not exists capital_contributions (
  id          uuid         primary key default gen_random_uuid(),
  user_id     text,
  date        date         not null,
  amount      numeric      not null check (amount > 0),
  type        text         not null check (type in ('aportacion','retirada','dividendo')),
  notes       text,
  created_at  timestamptz  default now()
);

create index if not exists capital_contributions_date_idx
  on capital_contributions (date);

-- Desactivar RLS — el proyecto usa anon key directamente sin auth
-- Necesario para que el insert/select/delete funcionen con la anon key
alter table capital_contributions disable row level security;

-- Si en el futuro quieres RLS con acceso total a anon (sin auth):
-- alter table capital_contributions enable row level security;
-- create policy "anon full access" on capital_contributions for all to anon using (true) with check (true);
