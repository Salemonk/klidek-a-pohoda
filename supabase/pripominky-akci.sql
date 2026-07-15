-- ============================================================
-- Automatické připomínky akcí na Discord
--
-- Co skript dělá:
--   - den předem (do 24 h) a hodinu předem pošle do #akce
--     připomínku s časem akce a seznamem přihlášených
--   - používá už existující webhook 'akce' z tabulky webhooky
--     (viz discord-upozorneni.sql) a plánovač pg_cron
--
-- POUŽITÍ: celý soubor spusťte v Supabase SQL Editoru (Run).
-- Předpoklad: už běží discord-upozorneni.sql (kvůli pg_net a webhooku).
--
-- Kdyby "create extension pg_cron" hlásilo chybu, zapněte pg_cron
-- ručně v administraci: Database -> Extensions -> vyhledat "pg_cron"
-- -> Enable, a pak spusťte skript znovu.
-- ============================================================

-- 1) Rozšíření: pg_cron (plánovač) a pg_net (HTTP, už z minula)
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 2) Sloupce: kdy už byla připomínka odeslána (aby se neposlala dvakrát)
alter table public.akce add column if not exists pripomenuto_den    timestamptz;
alter table public.akce add column if not exists pripomenuto_hodina timestamptz;

-- 3) Funkce, která rozešle připomínky (volá ji plánovač)
create or replace function public.posli_pripominky_akci()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  webhook   text;
  a         record;
  pocet_jdu int;
  jmena     text;
  epoch     bigint;
begin
  select url into webhook from webhooky where id = 'akce';
  if webhook is null or webhook = 'DOPLNTE' then return; end if;

  -- ----- DENNÍ připomínka: akce za 3 až 24 hodin -----
  for a in
    select * from akce
    where datum > now() + interval '3 hours'
      and datum <= now() + interval '24 hours'
      and pripomenuto_den is null
  loop
    select count(*), coalesce(string_agg(p.prezdivka, ', '), '')
      into pocet_jdu, jmena
      from ucast u join profily p on p.id = u.clen_id
      where u.akce_id = a.id and u.stav = 'jdu';
    epoch := extract(epoch from a.datum)::bigint;

    perform net.http_post(
      url := webhook,
      headers := '{"Content-Type": "application/json"}'::jsonb,
      body := jsonb_build_object('content',
        '⏰ **Připomínka: ' || a.nazev || '**' || chr(10)
        || 'Kdy: <t:' || epoch || ':F> (<t:' || epoch || ':R>)' || chr(10)
        || 'Zapsáno: ' || pocet_jdu
        || case when pocet_jdu > 0 then ' (' || jmena || ')' else '' end || chr(10)
        || 'Hlasování: https://klidekpohoda.cz/akce.html'
      )
    );
    update akce set pripomenuto_den = now() where id = a.id;
  end loop;

  -- ----- HODINOVÁ připomínka: akce do 60 minut -----
  for a in
    select * from akce
    where datum > now()
      and datum <= now() + interval '60 minutes'
      and pripomenuto_hodina is null
  loop
    select count(*), coalesce(string_agg(p.prezdivka, ', '), '')
      into pocet_jdu, jmena
      from ucast u join profily p on p.id = u.clen_id
      where u.akce_id = a.id and u.stav = 'jdu';
    epoch := extract(epoch from a.datum)::bigint;

    perform net.http_post(
      url := webhook,
      headers := '{"Content-Type": "application/json"}'::jsonb,
      body := jsonb_build_object('content',
        '🔔 **Už brzy: ' || a.nazev || '**' || chr(10)
        || 'Začátek <t:' || epoch || ':R> (<t:' || epoch || ':t>)' || chr(10)
        || 'Zapsáno: ' || pocet_jdu
        || case when pocet_jdu > 0 then ' (' || jmena || ')' else '' end
      )
    );
    update akce set pripomenuto_hodina = now() where id = a.id;
  end loop;
end;
$$;

-- 4) Naplánování: každých 15 minut zkontrolovat, co je potřeba připomenout.
--    Nejdřív případný starý plán zrušíme, ať jde skript spustit opakovaně.
select cron.unschedule(jobid) from cron.job where jobname = 'pripominky-akci-kap';

select cron.schedule(
  'pripominky-akci-kap',
  '*/15 * * * *',
  $$ select public.posli_pripominky_akci(); $$
);
