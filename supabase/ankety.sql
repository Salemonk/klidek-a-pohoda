-- ============================================================
-- Ankety: "Co budeme hrát?" s možnostmi a hlasováním
--
-- Anketu může založit každý člen, hlasují všichni, mazat/uzavřít
-- smí autor nebo vedení. Jeden člen = jeden hlas na anketu
-- (může ho změnit).
--
-- POUŽITÍ: celý soubor spusťte v Supabase SQL Editoru (Run).
-- Předpoklad: běží schema.sql a role-vedeni-a-upravy.sql (kvůli je_vedeni()).
-- ============================================================

-- 1) TABULKY

create table public.ankety (
  id        bigint generated always as identity primary key,
  otazka    text not null check (char_length(otazka) between 1 and 200),
  autor     uuid references public.profily (id) on delete set null,
  uzavrena  boolean not null default false,
  vytvoreno timestamptz not null default now()
);

create table public.ankety_moznosti (
  id        bigint generated always as identity primary key,
  anketa_id bigint not null references public.ankety (id) on delete cascade,
  text      text not null check (char_length(text) between 1 and 100),
  poradi    int not null default 0
);

create table public.ankety_hlasy (
  anketa_id  bigint not null references public.ankety (id) on delete cascade,
  moznost_id bigint not null references public.ankety_moznosti (id) on delete cascade,
  clen_id    uuid   not null references public.profily (id) on delete cascade,
  primary key (anketa_id, clen_id)   -- jeden hlas na anketu, dá se změnit
);

-- 2) ZABEZPEČENÍ

alter table public.ankety           enable row level security;
alter table public.ankety_moznosti  enable row level security;
alter table public.ankety_hlasy     enable row level security;

-- ANKETY: čtou všichni; zakládá každý člen; mazat/upravit (uzavřít) autor nebo vedení
create policy "cleni ctou ankety" on public.ankety
  for select to authenticated using (true);

create policy "clen zalozi anketu" on public.ankety
  for insert to authenticated with check (autor = auth.uid());

create policy "autor nebo vedeni upravi anketu" on public.ankety
  for update to authenticated
  using (autor = auth.uid() or public.je_vedeni())
  with check (autor = auth.uid() or public.je_vedeni());

create policy "autor nebo vedeni smaze anketu" on public.ankety
  for delete to authenticated
  using (autor = auth.uid() or public.je_vedeni());

-- MOŽNOSTI: čtou všichni; přidat smí jen autor dané ankety (při zakládání)
create policy "cleni ctou moznosti" on public.ankety_moznosti
  for select to authenticated using (true);

create policy "autor prida moznosti" on public.ankety_moznosti
  for insert to authenticated
  with check (exists (
    select 1 from public.ankety
    where id = anketa_id and autor = auth.uid()
  ));

create policy "autor nebo vedeni smaze moznosti" on public.ankety_moznosti
  for delete to authenticated
  using (exists (
    select 1 from public.ankety
    where id = anketa_id and (autor = auth.uid() or public.je_vedeni())
  ));

-- HLASY: čtou všichni; každý člen hlasuje sám za sebe
create policy "cleni ctou hlasy" on public.ankety_hlasy
  for select to authenticated using (true);

create policy "clen hlasuje" on public.ankety_hlasy
  for insert to authenticated with check (clen_id = auth.uid());

create policy "clen zmeni hlas" on public.ankety_hlasy
  for update to authenticated
  using (clen_id = auth.uid()) with check (clen_id = auth.uid());

create policy "clen zrusi hlas" on public.ankety_hlasy
  for delete to authenticated using (clen_id = auth.uid());
