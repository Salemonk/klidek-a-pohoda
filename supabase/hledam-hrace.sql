-- ============================================================
-- Tlačítko "Hledám hráče" (LFG): okamžité svolání na Discord
--
-- Člen klikne na tlačítko na Přehledu a do Discord kanálu
-- přiletí zpráva se zmínkou role (např. @Hledám hráče) a jeho
-- přezdívkou. Aby to nešlo zneužívat opakovaným klikáním, má to
-- vestavěné 15minutové čekání mezi použitími (na člena).
--
-- POUŽITÍ:
--   1) Doplňte WEBHOOK_URL a ROLE_ID na označená místa (DOPLNTE)
--   2) Spusťte celý soubor v Supabase SQL Editoru (Run)
--
-- Předpoklad: běží discord-upozorneni.sql (kvůli tabulce webhooky
-- a rozšíření pg_net).
--
-- POZOR: do verze na GitHubu patří jen tento vzor s "DOPLNTE",
-- skutečné hodnoty (webhook, role ID) nikdy neukládejte do repa.
-- ============================================================

-- 1) Sloupec pro hlídání, kdy člen naposledy použil tlačítko
alter table public.profily add column if not exists posledni_lfg timestamptz;

-- 2) Webhook pro kanál, kam mají zprávy chodit (přidá se do
--    existující tabulky webhooky, viz discord-upozorneni.sql)
insert into public.webhooky (id, url) values
  ('lfg', 'DOPLNTE')
on conflict (id) do update set url = excluded.url;

-- 3) Funkce, kterou volá web po kliknutí na tlačítko.
--    Parametr co_hrajeme je nepovinný (co člen napsal do textového
--    pole "Co chceš hrát?") a přidá se do zprávy v závorce.
--
--    Pokud jste dřív spustili starší verzi bez parametru, tenhle
--    řádek ji nejdřív odstraní, ať v databázi nezůstanou viset dvě
--    verze vedle sebe.
drop function if exists public.posli_lfg_vyzvu();

create or replace function public.posli_lfg_vyzvu(co_hrajeme text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  webhook   text;
  muj_stav  record;
  cekani    interval := interval '15 minutes';
  zbyva     numeric;
  parenteze text := '';
begin
  select prezdivka, posledni_lfg into muj_stav
  from profily where id = auth.uid();

  if muj_stav.posledni_lfg is not null and muj_stav.posledni_lfg > now() - cekani then
    zbyva := ceil(extract(epoch from (muj_stav.posledni_lfg + cekani - now())) / 60);
    raise exception 'Ještě chvíli počkej, zkus to znovu za % minut.', zbyva;
  end if;

  select url into webhook from webhooky where id = 'lfg';
  if webhook is null or webhook = 'DOPLNTE' then
    raise exception 'Webhook pro Hledám hráče není nastavený.';
  end if;

  if co_hrajeme is not null and trim(co_hrajeme) <> '' then
    parenteze := ' (' || trim(co_hrajeme) || ')';
  end if;

  perform net.http_post(
    url := webhook,
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := jsonb_build_object('content',
      '🎮 **' || muj_stav.prezdivka || '** hledá partu' || parenteze
      || ', kdo má teď čas? <@&DOPLNTE_ROLE_ID>'
    )
  );

  update profily set posledni_lfg = now() where id = auth.uid();
end;
$$;

grant execute on function public.posli_lfg_vyzvu(text) to authenticated;
