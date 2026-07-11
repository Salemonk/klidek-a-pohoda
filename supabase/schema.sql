-- ============================================================
-- Klídek a pohoda gaming — databázové schéma pro Supabase
--
-- POUŽITÍ: celý obsah tohoto souboru zkopírujte do SQL editoru
-- v administraci Supabase (SQL Editor → New query) a spusťte
-- tlačítkem RUN. Stačí spustit jednou. Podrobně viz NAVOD.md.
-- ============================================================


-- ------------------------------------------------------------
-- 1) TABULKY
-- ------------------------------------------------------------

-- Profily členů (navázané na přihlašovací účty)
create table public.profily (
  id         uuid primary key references auth.users (id) on delete cascade,
  prezdivka  text not null check (char_length(prezdivka) between 1 and 30),
  role       text not null default 'clen' check (role in ('clen', 'admin')),
  vytvoreno  timestamptz not null default now()
);

-- Informace o guildě (jediný řádek — stav, který upravuje admin)
create table public.guilda (
  id            int primary key default 1 check (id = 1),
  stav          text not null default 'Vše v klidu a pohodě. 🙂',
  aktualizovano timestamptz not null default now()
);
insert into public.guilda (id) values (1);

-- Akce guildy
create table public.akce (
  id        bigint generated always as identity primary key,
  nazev     text not null check (char_length(nazev) between 1 and 100),
  popis     text,
  datum     timestamptz not null,
  autor     uuid references public.profily (id) on delete set null,
  vytvoreno timestamptz not null default now()
);

-- Hlasování o účasti na akcích
create table public.ucast (
  akce_id  bigint not null references public.akce (id) on delete cascade,
  clen_id  uuid   not null references public.profily (id) on delete cascade,
  stav     text   not null check (stav in ('jdu', 'mozna', 'nejdu')),
  primary key (akce_id, clen_id)
);

-- Zprávy ve společném chatu
create table public.zpravy (
  id        bigint generated always as identity primary key,
  autor     uuid references public.profily (id) on delete set null,
  text      text not null check (char_length(text) between 1 and 2000),
  vytvoreno timestamptz not null default now()
);

-- Příspěvky na nástěnce
create table public.prispevky (
  id        bigint generated always as identity primary key,
  autor     uuid references public.profily (id) on delete set null,
  nadpis    text not null check (char_length(nadpis) between 1 and 120),
  text      text not null check (char_length(text) between 1 and 10000),
  vytvoreno timestamptz not null default now()
);


-- ------------------------------------------------------------
-- 2) AUTOMATICKÉ VYTVOŘENÍ PROFILU
-- Když admin založí nový účet, vytvoří se k němu profil.
-- Výchozí přezdívka je část e-mailu před zavináčem.
-- ------------------------------------------------------------

create or replace function public.novy_uzivatel()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profily (id, prezdivka)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'prezdivka', split_part(new.email, '@', 1))
  );
  return new;
end;
$$;

create trigger po_registraci
  after insert on auth.users
  for each row execute function public.novy_uzivatel();


-- ------------------------------------------------------------
-- 3) POMOCNÁ FUNKCE: je přihlášený člen admin?
-- ------------------------------------------------------------

create or replace function public.je_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profily
    where id = auth.uid() and role = 'admin'
  );
$$;


-- ------------------------------------------------------------
-- 4) ZABEZPEČENÍ (Row Level Security)
-- Všechna data vidí a upravují JEN přihlášení členové.
-- Nepřihlášený návštěvník se k ničemu nedostane.
-- ------------------------------------------------------------

alter table public.profily   enable row level security;
alter table public.guilda    enable row level security;
alter table public.akce      enable row level security;
alter table public.ucast     enable row level security;
alter table public.zpravy    enable row level security;
alter table public.prispevky enable row level security;

-- PROFILY: členové vidí všechny profily, upravit smí jen svou přezdívku
create policy "cleni ctou profily" on public.profily
  for select to authenticated using (true);

create policy "clen upravi svuj profil" on public.profily
  for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- Roli si člen změnit nesmí — povolíme upravovat jen sloupec s přezdívkou
revoke update on public.profily from authenticated;
grant update (prezdivka) on public.profily to authenticated;

-- GUILDA: čtou všichni členové, stav upravuje jen admin
create policy "cleni ctou stav guildy" on public.guilda
  for select to authenticated using (true);

create policy "admin upravi stav guildy" on public.guilda
  for update to authenticated
  using (public.je_admin()) with check (public.je_admin());

-- AKCE: čtou a vytvářejí všichni členové, mazat smí autor nebo admin
create policy "cleni ctou akce" on public.akce
  for select to authenticated using (true);

create policy "clen vytvori akci" on public.akce
  for insert to authenticated with check (autor = auth.uid());

create policy "autor nebo admin smaze akci" on public.akce
  for delete to authenticated
  using (autor = auth.uid() or public.je_admin());

-- ÚČAST: každý člen hlasuje sám za sebe
create policy "cleni ctou ucast" on public.ucast
  for select to authenticated using (true);

create policy "clen hlasuje za sebe" on public.ucast
  for insert to authenticated with check (clen_id = auth.uid());

create policy "clen zmeni svuj hlas" on public.ucast
  for update to authenticated
  using (clen_id = auth.uid()) with check (clen_id = auth.uid());

create policy "clen zrusi svuj hlas" on public.ucast
  for delete to authenticated using (clen_id = auth.uid());

-- ZPRÁVY: čtou a píší všichni členové, mazat smí autor nebo admin
create policy "cleni ctou zpravy" on public.zpravy
  for select to authenticated using (true);

create policy "clen posle zpravu" on public.zpravy
  for insert to authenticated with check (autor = auth.uid());

create policy "autor nebo admin smaze zpravu" on public.zpravy
  for delete to authenticated
  using (autor = auth.uid() or public.je_admin());

-- PŘÍSPĚVKY: čtou a píší všichni členové, mazat smí autor nebo admin
create policy "cleni ctou prispevky" on public.prispevky
  for select to authenticated using (true);

create policy "clen napise prispevek" on public.prispevky
  for insert to authenticated with check (autor = auth.uid());

create policy "autor upravi svuj prispevek" on public.prispevky
  for update to authenticated
  using (autor = auth.uid()) with check (autor = auth.uid());

create policy "autor nebo admin smaze prispevek" on public.prispevky
  for delete to authenticated
  using (autor = auth.uid() or public.je_admin());


-- ------------------------------------------------------------
-- 5) CHAT V REÁLNÉM ČASE
-- Zapne okamžité doručování nových zpráv všem připojeným členům.
-- ------------------------------------------------------------

alter publication supabase_realtime add table public.zpravy;
