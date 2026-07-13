-- ============================================================
-- Automatický úklid databáze
--
-- Co skript dělá (jednou týdně, v neděli ve 4:00 ráno):
--   - smaže staré NEVYUŽITÉ pozvánky (propadlé už přes 30 dní)
--   - VYUŽITÉ pozvánky se nemažou nikdy — zůstávají jako
--     přehled "kdo koho pozval"
--
-- Mazání starých zpráv z chatu NENÍ součástí automatiky —
-- je to citlivé rozhodnutí (mazání obsahu členů), které má
-- udělat vědomě správce, ne skript sám od sebe. Pokud byste
-- to přesto chtěli, návod je v komentáři níže u kroku 3.
--
-- POUŽITÍ: celý soubor spusťte v Supabase SQL Editoru (Run).
-- Vyžaduje rozšíření pg_cron (stejné jako pripominky-akci.sql;
-- pokud ho ještě nemáte, povolte v Database → Extensions → pg_cron).
-- ============================================================

create extension if not exists pg_cron;

-- 1) Funkce, která provede úklid
create or replace function public.uklid_databaze()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Nevyužité pozvánky, které propadly před více než 30 dny.
  -- (Čerstvě propadlé necháváme ještě chvíli vidět v přehledu pozvánek.)
  delete from public.pozvanky
  where pouzito is null
    and plati_do < now() - interval '30 days';

  -- ----------------------------------------------------------------
  -- KROK 3 (VOLITELNÉ, VYPNUTO): mazání starých zpráv z chatu.
  -- Pokud byste chtěli chat čistit, odkomentujte řádek níže
  -- (smaže zprávy starší než rok) a spusťte skript znovu:
  --
  -- delete from public.zpravy where vytvoreno < now() - interval '12 months';
  -- ----------------------------------------------------------------
end;
$$;

-- 2) Naplánování: každou neděli ve 4:00 ráno
select cron.unschedule(jobid) from cron.job where jobname = 'uklid-databaze-kap';

select cron.schedule(
  'uklid-databaze-kap',
  '0 4 * * 0',
  $$ select public.uklid_databaze(); $$
);
