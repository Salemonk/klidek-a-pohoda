-- ============================================================
-- Discord upozornění na nové akce a příspěvky
--
-- Jak to funguje: když se do databáze vloží nová akce nebo
-- příspěvek, databáze sama pošle zprávu na Discord webhook.
-- Adresy webhooků jsou uložené v tabulce, kterou přes web
-- nikdo nepřečte (RLS bez povolení = přístup jen pro správce).
--
-- POUŽITÍ: doplňte adresy webhooků na označená místa (DOPLNTE)
-- a celý soubor spusťte v Supabase SQL Editoru.
--
-- POZOR: do verze na GitHubu patří jen tento vzor s "DOPLNTE" —
-- skutečné adresy webhooků nikdy neukládejte do veřejného kódu.
-- ============================================================


-- 1) Rozšíření pg_net — umožní databázi posílat HTTP požadavky
create extension if not exists pg_net;


-- 2) Tabulka s adresami webhooků (tajná — žádná RLS pravidla
--    znamenají, že se k ní přes web nikdo nedostane)
create table if not exists public.webhooky (
  id  text primary key,
  url text not null
);
alter table public.webhooky enable row level security;

insert into public.webhooky (id, url) values
  ('akce',      'DOPLNTE'),
  ('prispevky', 'DOPLNTE')
on conflict (id) do update set url = excluded.url;


-- 3) Upozornění na novou akci
create or replace function public.ohlas_novou_akci()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  webhook text;
  jmeno   text;
begin
  select url into webhook from webhooky where id = 'akce';
  if webhook is null or webhook = 'DOPLNTE' then return new; end if;

  select prezdivka into jmeno from profily where id = new.autor;

  perform net.http_post(
    url := webhook,
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := jsonb_build_object(
      'content',
      '📅 **Nová akce: ' || new.nazev || '**' || chr(10)
      || 'Kdy: <t:' || extract(epoch from new.datum)::bigint || ':F>' || chr(10)
      || 'Naplánoval(a): ' || coalesce(jmeno, '?') || chr(10)
      || 'Hlasujte o účasti: https://salemonk.github.io/klidek-a-pohoda/akce.html'
    )
  );
  return new;
end;
$$;

drop trigger if exists po_vlozeni_akce on public.akce;
create trigger po_vlozeni_akce
  after insert on public.akce
  for each row execute function public.ohlas_novou_akci();


-- 4) Upozornění na nový příspěvek
create or replace function public.ohlas_novy_prispevek()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  webhook text;
  jmeno   text;
begin
  select url into webhook from webhooky where id = 'prispevky';
  if webhook is null or webhook = 'DOPLNTE' then return new; end if;

  select prezdivka into jmeno from profily where id = new.autor;

  perform net.http_post(
    url := webhook,
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := jsonb_build_object(
      'content',
      '📝 **Nový příspěvek na nástěnce: ' || new.nadpis || '**' || chr(10)
      || 'Napsal(a): ' || coalesce(jmeno, '?') || chr(10)
      || 'Přečtěte si ho: https://salemonk.github.io/klidek-a-pohoda/prispevky.html'
    )
  );
  return new;
end;
$$;

drop trigger if exists po_vlozeni_prispevku on public.prispevky;
create trigger po_vlozeni_prispevku
  after insert on public.prispevky
  for each row execute function public.ohlas_novy_prispevek();
