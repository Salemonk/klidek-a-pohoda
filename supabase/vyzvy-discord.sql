-- ============================================================
-- Výzvy (randomizer stratagemů): odeslání na Discord
--
-- Člen si na stránce Výzvy vylosuje stratagem/loadout a tlačítkem
-- "Poslat výzvu do Discordu" pošle text party do vybraného kanálu.
-- Aby to nešlo zneužívat opakovaným klikáním, má to vestavěné
-- 5minutové čekání mezi použitími (na člena).
--
-- POUŽITÍ:
--   1) Doplňte WEBHOOK_URL na označené místo (DOPLNTE)
--   2) Spusťte celý soubor v Supabase SQL Editoru (Run)
--
-- Předpoklad: běží discord-upozorneni.sql (kvůli tabulce webhooky
-- a rozšíření pg_net).
--
-- POZOR: do verze na GitHubu patří jen tento vzor s "DOPLNTE",
-- skutečnou adresu webhooku nikdy neukládejte do repa.
-- ============================================================

-- 1) Sloupec pro hlídání, kdy člen naposledy poslal výzvu
alter table public.profily add column if not exists posledni_vyzva timestamptz;

-- 2) Webhook pro kanál, kam mají zprávy chodit (přidá se do
--    existující tabulky webhooky, viz discord-upozorneni.sql)
insert into public.webhooky (id, url) values
  ('vyzvy', 'DOPLNTE')
on conflict (id) do update set url = excluded.url;

-- 3) Funkce, kterou volá web po kliknutí na tlačítko. Text výzvy
--    (i s emoji a přezdívkou) skládá web, funkce jen ohlídá cooldown,
--    délku textu a doručení na Discord.
create or replace function public.posli_vyzvu(text_vyzvy text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  webhook  text;
  muj_stav record;
  cekani   interval := interval '5 minutes';
  zbyva    numeric;
begin
  if text_vyzvy is null or trim(text_vyzvy) = '' then
    raise exception 'Text výzvy je prázdný.';
  end if;
  if char_length(text_vyzvy) > 500 then
    raise exception 'Text výzvy je moc dlouhý.';
  end if;

  select posledni_vyzva into muj_stav
  from profily where id = auth.uid();

  if muj_stav.posledni_vyzva is not null and muj_stav.posledni_vyzva > now() - cekani then
    zbyva := ceil(extract(epoch from (muj_stav.posledni_vyzva + cekani - now())) / 60);
    raise exception 'Ještě chvíli počkej, zkus to znovu za % minut.', zbyva;
  end if;

  select url into webhook from webhooky where id = 'vyzvy';
  if webhook is null or webhook = 'DOPLNTE' then
    raise exception 'Webhook pro Výzvy není nastavený.';
  end if;

  perform net.http_post(
    url := webhook,
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := jsonb_build_object('content', text_vyzvy)
  );

  update profily set posledni_vyzva = now() where id = auth.uid();
end;
$$;

grant execute on function public.posli_vyzvu(text) to authenticated;
