-- ============================================================
-- DESKOVKY: veřejný kalendář deskoherní skupiny
--
-- Samostatná sekce bez vazby na guildu. Kdokoli (i bez účtu)
-- vidí akce a hry, přihlásí se na akci a hlasuje, co se bude
-- hrát. Akce a hry spravuje jen admin guildy (je_admin()).
--
-- Nepřihlášený návštěvník NIKDY nezapisuje přímo do tabulek,
-- jen přes tři funkce níže (deskovky_prihlasit, deskovky_zmenit_hlasy,
-- deskovky_odhlasit), které hlídají limity.
--
-- Spuštění: Supabase -> SQL Editor -> vložit celý soubor -> Run.
-- Skript jde spustit znovu (tabulky nesmaže, hry nezdvojí).
-- Předpoklad: už běží schema.sql (funkce je_admin) a pg_cron
-- (zapnutý skriptem pripominky-akci.sql).
-- ============================================================


-- ------------------------------------------------------------
-- 1) TABULKY
-- ------------------------------------------------------------

create table if not exists public.deskovky_hry (
  id        bigint generated always as identity primary key,
  zh_id     int unique,                -- ID hry na zatrolene-hry.cz (u ručně přidaných prázdné)
  nazev     text not null check (char_length(nazev) between 1 and 120),
  rok       int check (rok between 1900 and 2100),
  obrazek   text check (char_length(obrazek) <= 200),   -- cesta v repozitáři, např. assets/deskovky/334.jpg
  odkaz     text check (odkaz ~ '^https://'),
  vytvoreno timestamptz not null default now()
);

create table if not exists public.deskovky_akce (
  id        bigint generated always as identity primary key,
  nazev     text not null check (char_length(nazev) between 1 and 100),
  datum     timestamptz not null,
  misto     text check (char_length(misto) <= 150),
  popis     text check (char_length(popis) <= 1000),
  kapacita  int check (kapacita between 1 and 50),     -- prázdné = bez omezení (strop 30)
  vytvoreno timestamptz not null default now(),
  upraveno  timestamptz
);

-- Hry nabídnuté k hlasování u konkrétní akce
create table if not exists public.deskovky_akce_hry (
  akce_id bigint not null references public.deskovky_akce(id) on delete cascade,
  hra_id  bigint not null references public.deskovky_hry(id)  on delete cascade,
  primary key (akce_id, hra_id)
);

create table if not exists public.deskovky_prihlasky (
  id         bigint generated always as identity primary key,
  akce_id    bigint not null references public.deskovky_akce(id) on delete cascade,
  jmeno      text not null check (char_length(jmeno) between 2 and 40),
  token_hash text not null,            -- SHA-256 tajného kódu z prohlížeče, kód samotný neukládáme
  vytvoreno  timestamptz not null default now()
);
create unique index if not exists deskovky_prihlasky_jmeno
  on public.deskovky_prihlasky (akce_id, lower(jmeno));

-- Skupinové heslo pro přihlášení (jediný řádek id=1). Ukládá se jen otisk.
-- Prázdné heslo_hash = přihlásit se může kdokoli bez hesla.
create table if not exists public.deskovky_nastaveni (
  id         int primary key default 1 check (id = 1),
  heslo_hash text
);
insert into public.deskovky_nastaveni (id) values (1) on conflict (id) do nothing;

create table if not exists public.deskovky_hlasy (
  prihlaska_id bigint not null references public.deskovky_prihlasky(id) on delete cascade,
  hra_id       bigint not null references public.deskovky_hry(id) on delete cascade,
  primary key (prihlaska_id, hra_id)
);


-- ------------------------------------------------------------
-- 2) ZABEZPEČENÍ
-- Čtení: kdokoli (anon i přihlášený).
-- Zápis: jen admin guildy; návštěvníci jen přes funkce níže.
-- ------------------------------------------------------------

alter table public.deskovky_hry       enable row level security;
alter table public.deskovky_akce      enable row level security;
alter table public.deskovky_akce_hry  enable row level security;
alter table public.deskovky_prihlasky enable row level security;
alter table public.deskovky_hlasy     enable row level security;
-- Nastavení: RLS bez jediné policy = přímo ho nikdo nečte ani nemění,
-- jen funkce níže (security definer)
alter table public.deskovky_nastaveni enable row level security;
revoke all on public.deskovky_nastaveni from anon, authenticated;

-- Pojistka: návštěvník bez účtu nesmí do tabulek zapisovat vůbec
revoke insert, update, delete, truncate on
  public.deskovky_hry, public.deskovky_akce, public.deskovky_akce_hry,
  public.deskovky_prihlasky, public.deskovky_hlasy
from anon;

-- Otisk tajného kódu nesmí vidět nikdo: čtení přihlášek jen po sloupcích
revoke select on public.deskovky_prihlasky from anon, authenticated;
grant select (id, akce_id, jmeno, vytvoreno) on public.deskovky_prihlasky to anon, authenticated;

drop policy if exists "kdokoli cte hry"        on public.deskovky_hry;
drop policy if exists "admin spravuje hry"     on public.deskovky_hry;
drop policy if exists "kdokoli cte akce"       on public.deskovky_akce;
drop policy if exists "admin spravuje akce"    on public.deskovky_akce;
drop policy if exists "kdokoli cte hry akci"   on public.deskovky_akce_hry;
drop policy if exists "admin spravuje hry akci" on public.deskovky_akce_hry;
drop policy if exists "kdokoli cte prihlasky"  on public.deskovky_prihlasky;
drop policy if exists "admin maze prihlasky"   on public.deskovky_prihlasky;
drop policy if exists "kdokoli cte hlasy"      on public.deskovky_hlasy;

create policy "kdokoli cte hry" on public.deskovky_hry
  for select to anon, authenticated using (true);
create policy "admin spravuje hry" on public.deskovky_hry
  for all to authenticated using (public.je_admin()) with check (public.je_admin());

create policy "kdokoli cte akce" on public.deskovky_akce
  for select to anon, authenticated using (true);
create policy "admin spravuje akce" on public.deskovky_akce
  for all to authenticated using (public.je_admin()) with check (public.je_admin());

create policy "kdokoli cte hry akci" on public.deskovky_akce_hry
  for select to anon, authenticated using (true);
create policy "admin spravuje hry akci" on public.deskovky_akce_hry
  for all to authenticated using (public.je_admin()) with check (public.je_admin());

create policy "kdokoli cte prihlasky" on public.deskovky_prihlasky
  for select to anon, authenticated using (true);
create policy "admin maze prihlasky" on public.deskovky_prihlasky
  for delete to authenticated using (public.je_admin());

create policy "kdokoli cte hlasy" on public.deskovky_hlasy
  for select to anon, authenticated using (true);


-- ------------------------------------------------------------
-- 3) FUNKCE PRO NÁVŠTĚVNÍKY (jediná cesta k zápisu)
-- Chybové kódy (web je převádí na české hlášky):
--   neplatny_kod, akce_neexistuje, akce_probehla, spatne_jmeno,
--   plno, jmeno_obsazeno, zkuste_pozdeji, nenalezeno, spatne_heslo
-- ------------------------------------------------------------

create or replace function public.deskovky_otisk(kod text)
returns text language sql immutable
as $$ select encode(sha256(convert_to(kod, 'UTF8')), 'hex') $$;

-- Je nastavené skupinové heslo? (web podle toho ukáže pole na heslo)
create or replace function public.deskovky_vyzaduje_heslo()
returns boolean language sql stable security definer set search_path = public
as $$ select coalesce((select heslo_hash is not null from public.deskovky_nastaveni where id = 1), false) $$;

-- Ověří heslo předem (web si ho pak zapamatuje), true/false
create or replace function public.deskovky_over_heslo(p_heslo text)
returns boolean language sql stable security definer set search_path = public
as $$
  select coalesce((select heslo_hash is null
                          or heslo_hash = public.deskovky_otisk(btrim(coalesce(p_heslo, '')))
                   from public.deskovky_nastaveni where id = 1), true)
$$;

-- Admin nastaví nové heslo (prázdné = zrušit heslo)
create or replace function public.deskovky_nastav_heslo(p_heslo text)
returns void language plpgsql security definer set search_path = public
as $$
begin
  if not public.je_admin() then raise exception 'jen_admin'; end if;
  update public.deskovky_nastaveni
  set heslo_hash = case when btrim(coalesce(p_heslo, '')) = '' then null
                        else public.deskovky_otisk(btrim(p_heslo)) end
  where id = 1;
end;
$$;

-- Starší verze funkce bez hesla (kdyby skript běžel podruhé)
drop function if exists public.deskovky_prihlasit(bigint, text, bigint[], text);

create or replace function public.deskovky_prihlasit(
  p_akce bigint, p_jmeno text, p_hry bigint[], p_kod text, p_heslo text default null
) returns bigint
language plpgsql security definer set search_path = public
as $$
declare
  v_akce  public.deskovky_akce;
  v_jmeno text := btrim(regexp_replace(coalesce(p_jmeno, ''), '\s+', ' ', 'g'));
  v_id    bigint;
begin
  if not public.deskovky_over_heslo(p_heslo) then
    raise exception 'spatne_heslo';
  end if;

  if p_kod is null or char_length(p_kod) < 32 or char_length(p_kod) > 200 then
    raise exception 'neplatny_kod';
  end if;

  select * into v_akce from public.deskovky_akce where id = p_akce for update;
  if not found then raise exception 'akce_neexistuje'; end if;
  if v_akce.datum < now() then raise exception 'akce_probehla'; end if;

  if char_length(v_jmeno) not between 2 and 40 then raise exception 'spatne_jmeno'; end if;

  -- Kapacita akce (bez zadané kapacity pevný strop 30)
  if (select count(*) from public.deskovky_prihlasky where akce_id = p_akce)
     >= coalesce(v_akce.kapacita, 30) then
    raise exception 'plno';
  end if;

  -- Ochrana proti zaplavení: víc než 20 přihlášek za 10 minut na celém webu
  if (select count(*) from public.deskovky_prihlasky
      where vytvoreno > now() - interval '10 minutes') >= 20 then
    raise exception 'zkuste_pozdeji';
  end if;

  begin
    insert into public.deskovky_prihlasky (akce_id, jmeno, token_hash)
    values (p_akce, v_jmeno, public.deskovky_otisk(p_kod))
    returning id into v_id;
  exception when unique_violation then
    raise exception 'jmeno_obsazeno';
  end;

  -- Hlasy jen pro hry, které jsou u akce nabídnuté
  insert into public.deskovky_hlasy (prihlaska_id, hra_id)
  select v_id, ah.hra_id from public.deskovky_akce_hry ah
  where ah.akce_id = p_akce and ah.hra_id = any(coalesce(p_hry, '{}'));

  return v_id;
end;
$$;

create or replace function public.deskovky_zmenit_hlasy(
  p_prihlaska bigint, p_kod text, p_hry bigint[]
) returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_akce_id bigint;
begin
  select p.akce_id into v_akce_id
  from public.deskovky_prihlasky p
  join public.deskovky_akce a on a.id = p.akce_id
  where p.id = p_prihlaska
    and p.token_hash = public.deskovky_otisk(coalesce(p_kod, ''))
    and a.datum >= now();
  if not found then raise exception 'nenalezeno'; end if;

  delete from public.deskovky_hlasy where prihlaska_id = p_prihlaska;
  insert into public.deskovky_hlasy (prihlaska_id, hra_id)
  select p_prihlaska, ah.hra_id from public.deskovky_akce_hry ah
  where ah.akce_id = v_akce_id and ah.hra_id = any(coalesce(p_hry, '{}'));
end;
$$;

create or replace function public.deskovky_odhlasit(p_prihlaska bigint, p_kod text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  delete from public.deskovky_prihlasky
  where id = p_prihlaska
    and token_hash = public.deskovky_otisk(coalesce(p_kod, ''));
  if not found then raise exception 'nenalezeno'; end if;
end;
$$;

revoke execute on function public.deskovky_prihlasit(bigint, text, bigint[], text, text) from public;
revoke execute on function public.deskovky_zmenit_hlasy(bigint, text, bigint[]) from public;
revoke execute on function public.deskovky_odhlasit(bigint, text) from public;
revoke execute on function public.deskovky_nastav_heslo(text) from public, anon;
grant execute on function public.deskovky_prihlasit(bigint, text, bigint[], text, text) to anon, authenticated;
grant execute on function public.deskovky_nastav_heslo(text) to authenticated;
grant execute on function public.deskovky_zmenit_hlasy(bigint, text, bigint[]) to anon, authenticated;
grant execute on function public.deskovky_odhlasit(bigint, text) to anon, authenticated;


-- ------------------------------------------------------------
-- 4) ÚKLID: jména přihlášených se mažou 30 dní po akci
-- (akce samotná zůstává v Proběhlých, jen bez jmen a hlasů)
-- ------------------------------------------------------------

select cron.unschedule(jobid) from cron.job where jobname = 'deskovky-uklid';
select cron.schedule(
  'deskovky-uklid',
  '30 4 * * *',
  $$ delete from public.deskovky_prihlasky p
     using public.deskovky_akce a
     where a.id = p.akce_id and a.datum < now() - interval '30 days' $$
);


-- ------------------------------------------------------------
-- 5) HRY: základní hry ze sbírky na zatrolene-hry.cz (87 ks)
-- ------------------------------------------------------------

insert into public.deskovky_hry (zh_id, nazev, rok, obrazek, odkaz) values
  (9032, 'Aeon''s End: Legacy', 2019, 'assets/deskovky/9032.jpg', 'https://www.zatrolene-hry.cz/spolecenska-hra/aeon-s-end-legacy-9032/'),
  (7437, 'Aeon''s End: War Eternal', 2017, 'assets/deskovky/7437.jpg', 'https://www.zatrolene-hry.cz/spolecenska-hra/aeon-s-end-war-eternal-7437/'),
  (10595, 'Amazonie', 2021, 'assets/deskovky/10595.jpg', 'https://www.zatrolene-hry.cz/spolecenska-hra/amazonie-10595/'),
  (334, 'Battlestar Galactica: The Board Game', 2008, 'assets/deskovky/334.jpg', 'https://www.zatrolene-hry.cz/spolecenska-hra/battlestar-galactica-the-board-game-334/'),
  (5351, 'Boží zboží', 2015, 'assets/deskovky/5351.jpg', 'https://www.zatrolene-hry.cz/spolecenska-hra/bozi-zbozi-5351/'),
  (10583, 'Canvas', 2020, 'assets/deskovky/10583.jpg', 'https://www.zatrolene-hry.cz/spolecenska-hra/canvas-10583/'),
  (8, 'Carcassonne', 2000, 'assets/deskovky/8.jpg', 'https://www.zatrolene-hry.cz/spolecenska-hra/carcassonne-8/'),
  (3714, 'Caverna: Sedláci z jeskyní', 2013, 'assets/deskovky/3714.jpg', 'https://www.zatrolene-hry.cz/spolecenska-hra/caverna-sedlaci-z-jeskyni-3714/'),
  (14, 'Citadela', 2000, 'assets/deskovky/14.jpg', 'https://www.zatrolene-hry.cz/spolecenska-hra/citadela-14/'),
  (3299, 'City of Remnants', 2013, 'assets/deskovky/3299.jpg', 'https://www.zatrolene-hry.cz/spolecenska-hra/city-of-remnants-3299/'),
  (13189, 'Coatl: Karetní hra', 2022, 'assets/deskovky/13189.jpg', 'https://www.zatrolene-hry.cz/spolecenska-hra/coatl-karetni-hra-13189/'),
  (7332, 'Čtveráček', 2017, 'assets/deskovky/7332.jpg', 'https://www.zatrolene-hry.cz/spolecenska-hra/ctveracek-7332/'),
  (7031, 'Dice Forge', 2017, 'assets/deskovky/7031.jpg', 'https://www.zatrolene-hry.cz/spolecenska-hra/dice-forge-7031/'),
  (7608, 'Divukraj', 2018, 'assets/deskovky/7608.jpg', 'https://www.zatrolene-hry.cz/spolecenska-hra/divukraj-7608/'),
  (232, 'Doba Kamenná', 2008, 'assets/deskovky/232.jpg', 'https://www.zatrolene-hry.cz/spolecenska-hra/doba-kamenna-232/'),
  (399, 'Dostihy a sázky', 1984, 'assets/deskovky/399.jpg', 'https://www.zatrolene-hry.cz/spolecenska-hra/dostihy-a-sazky-399/'),
  (6806, 'Duchové ostrova', 2017, 'assets/deskovky/6806.jpg', 'https://www.zatrolene-hry.cz/spolecenska-hra/duchove-ostrova-6806/'),
  (3640, 'Eldritch Horror', 2013, 'assets/deskovky/3640.jpg', 'https://www.zatrolene-hry.cz/spolecenska-hra/eldritch-horror-3640/'),
  (6748, 'Ethnos', 2017, 'assets/deskovky/6748.jpg', 'https://www.zatrolene-hry.cz/spolecenska-hra/ethnos-6748/'),
  (3603, 'Euphoria: Cestou k lepší dystopii', 2013, 'assets/deskovky/3603.jpg', 'https://www.zatrolene-hry.cz/spolecenska-hra/euphoria-cestou-k-lepsi-dystopii-3603/'),
  (7323, 'Ex Libris', 2017, 'assets/deskovky/7323.jpg', 'https://www.zatrolene-hry.cz/spolecenska-hra/ex-libris-7323/'),
  (5574, 'Fuse: Čas nezastavíš', 2015, 'assets/deskovky/5574.jpg', 'https://www.zatrolene-hry.cz/spolecenska-hra/fuse-cas-nezastavis-5574/'),
  (5203, 'Gloomhaven', 2017, 'assets/deskovky/5203.jpg', 'https://www.zatrolene-hry.cz/spolecenska-hra/gloomhaven-5203/'),
  (4098, 'Hledá se hrdina', 2012, 'assets/deskovky/4098.jpg', 'https://www.zatrolene-hry.cz/spolecenska-hra/hleda-se-hrdina-4098/'),
  (12255, 'Hra o trůny: Spiknutí', 2021, 'assets/deskovky/12255.jpg', 'https://www.zatrolene-hry.cz/spolecenska-hra/hra-o-truny-spiknuti-12255/'),
  (1251, 'Jaipur', 2009, 'assets/deskovky/1251.jpg', 'https://www.zatrolene-hry.cz/spolecenska-hra/jaipur-1251/'),
  (1067, 'Kamionem po Evropě', 1989, 'assets/deskovky/1067.jpg', 'https://www.zatrolene-hry.cz/spolecenska-hra/kamionem-po-evrope-1067/'),
  (12167, 'Karak: Goblin', 2021, 'assets/deskovky/12167.jpg', 'https://www.zatrolene-hry.cz/spolecenska-hra/karak-goblin-12167/'),
  (5263, 'Klub ztroskotanců', 2015, 'assets/deskovky/5263.jpg', 'https://www.zatrolene-hry.cz/spolecenska-hra/klub-ztroskotancu-5263/'),
  (7373, 'Kočičí klub', 2017, 'assets/deskovky/7373.jpg', 'https://www.zatrolene-hry.cz/spolecenska-hra/kocici-klub-7373/'),
  (10100, 'Komu zvoní tramvaj', 2020, 'assets/deskovky/10100.jpg', 'https://www.zatrolene-hry.cz/spolecenska-hra/komu-zvoni-tramvaj-10100/'),
  (6551, 'Konec věků', 2016, 'assets/deskovky/6551.jpg', 'https://www.zatrolene-hry.cz/spolecenska-hra/konec-veku-6551/'),
  (9713, 'Konec věků: Nová éra', 2019, 'assets/deskovky/9713.jpg', 'https://www.zatrolene-hry.cz/spolecenska-hra/konec-veku-nova-era-9713/'),
  (12570, 'Kroniky Avelu', 2021, 'assets/deskovky/12570.jpg', 'https://www.zatrolene-hry.cz/spolecenska-hra/kroniky-avelu-12570/'),
  (7484, 'Labilní jednorožci', 2017, 'assets/deskovky/7484.jpg', 'https://www.zatrolene-hry.cz/spolecenska-hra/labilni-jednorozci-7484/'),
  (7124, 'Liška podšitá', 2017, 'assets/deskovky/7124.jpg', 'https://www.zatrolene-hry.cz/spolecenska-hra/liska-podsita-7124/'),
  (3788, 'Machi Koro', 2012, 'assets/deskovky/3788.jpg', 'https://www.zatrolene-hry.cz/spolecenska-hra/machi-koro-3788/'),
  (7239, 'Majesty: Má koruna, mé království', 2017, 'assets/deskovky/7239.jpg', 'https://www.zatrolene-hry.cz/spolecenska-hra/majesty-ma-koruna-me-kralovstvi-7239/'),
  (3952, 'Malá velká království', 2013, 'assets/deskovky/3952.jpg', 'https://www.zatrolene-hry.cz/spolecenska-hra/mala-velka-kralovstvi-3952/'),
  (4364, 'Malé velké galaxie', 2015, 'assets/deskovky/4364.jpg', 'https://www.zatrolene-hry.cz/spolecenska-hra/male-velke-galaxie-4364/'),
  (7641, 'Malé velké zombie', 2018, 'assets/deskovky/7641.jpg', 'https://www.zatrolene-hry.cz/spolecenska-hra/male-velke-zombie-7641/'),
  (7838, 'The Mind: Souznění myslí', 2018, 'assets/deskovky/7838.jpg', 'https://www.zatrolene-hry.cz/spolecenska-hra/the-mind-souzneni-mysli-7838/'),
  (14013, 'Monopoly Bid', 2020, 'assets/deskovky/14013.jpg', 'https://www.zatrolene-hry.cz/spolecenska-hra/monopoly-bid-14013/'),
  (7071, 'Munchkin: Apokalypsa', 2012, 'assets/deskovky/7071.jpg', 'https://www.zatrolene-hry.cz/spolecenska-hra/munchkin-apokalypsa-7071/'),
  (6359, 'Nejsme tu sami', 2016, 'assets/deskovky/6359.jpg', 'https://www.zatrolene-hry.cz/spolecenska-hra/nejsme-tu-sami-6359/'),
  (6821, 'Neobvyklí podezřelí', 2015, 'assets/deskovky/6821.jpg', 'https://www.zatrolene-hry.cz/spolecenska-hra/neobvykli-podezreli-6821/'),
  (11972, 'Nevyzpytatelní', 2021, 'assets/deskovky/11972.jpg', 'https://www.zatrolene-hry.cz/spolecenska-hra/nevyzpytatelni-11972/'),
  (10312, 'Odysea: Společně k deváté planetě', 2020, 'assets/deskovky/10312.jpg', 'https://www.zatrolene-hry.cz/spolecenska-hra/odysea-spolecne-k-devate-planete-10312/'),
  (13081, 'Oltréé', 2021, 'assets/deskovky/13081.jpg', 'https://www.zatrolene-hry.cz/spolecenska-hra/oltree-13081/'),
  (1503, 'Pán prstenů: Karetní hra', 2010, 'assets/deskovky/1503.jpg', 'https://www.zatrolene-hry.cz/spolecenska-hra/pan-prstenu-karetni-hra-1503/'),
  (8935, 'Parky', 2019, 'assets/deskovky/8935.jpg', 'https://www.zatrolene-hry.cz/spolecenska-hra/parky-8935/'),
  (12145, 'Parky: Na cestách', 2021, 'assets/deskovky/12145.jpg', 'https://www.zatrolene-hry.cz/spolecenska-hra/parky-na-cestach-12145/'),
  (7954, 'Pevnost', 2015, 'assets/deskovky/7954.jpg', 'https://www.zatrolene-hry.cz/spolecenska-hra/pevnost-7954/'),
  (13767, 'Pivo a chléb', 2022, 'assets/deskovky/13767.jpg', 'https://www.zatrolene-hry.cz/spolecenska-hra/pivo-a-chleb-13767/'),
  (12242, 'Pod hvězdami', 2021, 'assets/deskovky/12242.jpg', 'https://www.zatrolene-hry.cz/spolecenska-hra/pod-hvezdami-12242/'),
  (3956, 'Port Royal', 2014, 'assets/deskovky/3956.jpg', 'https://www.zatrolene-hry.cz/spolecenska-hra/port-royal-3956/'),
  (8434, 'Project L', 2020, 'assets/deskovky/8434.jpg', 'https://www.zatrolene-hry.cz/spolecenska-hra/project-l-8434/'),
  (8303, 'Railroad Ink: Azurově modrá edice', 2018, 'assets/deskovky/8303.jpg', 'https://www.zatrolene-hry.cz/spolecenska-hra/railroad-ink-azurove-modra-edice-8303/'),
  (9062, 'Res Arcana', 2019, 'assets/deskovky/9062.jpg', 'https://www.zatrolene-hry.cz/spolecenska-hra/res-arcana-9062/'),
  (3297, 'The Resistance: Avalon', 2012, 'assets/deskovky/3297.jpg', 'https://www.zatrolene-hry.cz/spolecenska-hra/the-resistance-avalon-3297/'),
  (3102, 'Robinson Crusoe: Dobrodružství na Prokletém ostrově', 2012, 'assets/deskovky/3102.jpg', 'https://www.zatrolene-hry.cz/spolecenska-hra/robinson-crusoe-dobrodruzstvi-na-prokletem-ostrove-3102/'),
  (5445, 'RobotiCS', 2015, 'assets/deskovky/5445.jpg', 'https://www.zatrolene-hry.cz/spolecenska-hra/robotics-5445/'),
  (4429, 'Safari Bar', 2014, 'assets/deskovky/4429.jpg', 'https://www.zatrolene-hry.cz/spolecenska-hra/safari-bar-4429/'),
  (10253, 'Safari Bar: Další šelmy na tahu', 2019, 'assets/deskovky/10253.jpg', 'https://www.zatrolene-hry.cz/spolecenska-hra/safari-bar-dalsi-selmy-na-tahu-10253/'),
  (5265, 'Safari Bar: Nové šelmy před barem', 2015, 'assets/deskovky/5265.jpg', 'https://www.zatrolene-hry.cz/spolecenska-hra/safari-bar-nove-selmy-pred-barem-5265/'),
  (6251, 'Sagrada', 2017, 'assets/deskovky/6251.jpg', 'https://www.zatrolene-hry.cz/spolecenska-hra/sagrada-6251/'),
  (8664, 'Shadows: Amsterdam', 2018, 'assets/deskovky/8664.jpg', 'https://www.zatrolene-hry.cz/spolecenska-hra/shadows-amsterdam-8664/'),
  (8753, 'Shit Happens', 2018, 'assets/deskovky/8753.jpg', 'https://www.zatrolene-hry.cz/spolecenska-hra/shit-happens-8753/'),
  (9336, 'Shit Happens: Zasraná práce', 2018, 'assets/deskovky/9336.jpg', 'https://www.zatrolene-hry.cz/spolecenska-hra/shit-happens-zasrana-prace-9336/'),
  (11760, 'The Siege of Runedar', 2021, 'assets/deskovky/11760.jpg', 'https://www.zatrolene-hry.cz/spolecenska-hra/the-siege-of-runedar-11760/'),
  (2288, 'Skull', 2011, 'assets/deskovky/2288.jpg', 'https://www.zatrolene-hry.cz/spolecenska-hra/skull-2288/'),
  (14075, 'Star Wars: The Deckbuilding Game', 2023, 'assets/deskovky/14075.jpg', 'https://www.zatrolene-hry.cz/spolecenska-hra/star-wars-the-deckbuilding-game-14075/'),
  (8976, 'Star Wars: Vnější okraj', 2019, 'assets/deskovky/8976.jpg', 'https://www.zatrolene-hry.cz/spolecenska-hra/star-wars-vnejsi-okraj-8976/'),
  (4533, 'Sushi Go!', 2013, 'assets/deskovky/4533.jpg', 'https://www.zatrolene-hry.cz/spolecenska-hra/sushi-go-4533/'),
  (4101, 'Talisman (2nd edition)', 1983, 'assets/deskovky/4101.jpg', 'https://www.zatrolene-hry.cz/spolecenska-hra/talisman-2nd-edition-4101/'),
  (5837, 'This War of Mine: Desková hra', 2016, 'assets/deskovky/5837.jpg', 'https://www.zatrolene-hry.cz/spolecenska-hra/this-war-of-mine-deskova-hra-5837/'),
  (5385, 'T.I.M.E Stories', 2015, 'assets/deskovky/5385.jpg', 'https://www.zatrolene-hry.cz/spolecenska-hra/t-i-m-e-stories-5385/'),
  (14078, 'Tokaido Duo', 2022, 'assets/deskovky/14078.jpg', 'https://www.zatrolene-hry.cz/spolecenska-hra/tokaido-duo-14078/'),
  (13084, 'TOP 10', 2020, 'assets/deskovky/13084.jpg', 'https://www.zatrolene-hry.cz/spolecenska-hra/top-10-13084/'),
  (8481, 'V pasti', 2018, 'assets/deskovky/8481.jpg', 'https://www.zatrolene-hry.cz/spolecenska-hra/v-pasti-8481/'),
  (4985, 'Ve víru věků', 2015, 'assets/deskovky/4985.jpg', 'https://www.zatrolene-hry.cz/spolecenska-hra/ve-viru-veku-4985/'),
  (1607, 'Vládce Tokia', 2010, 'assets/deskovky/1607.jpg', 'https://www.zatrolene-hry.cz/spolecenska-hra/vladce-tokia-1607/'),
  (1147, 'Vlkodlaci z Temného hvozdu', 2001, 'assets/deskovky/1147.jpg', 'https://www.zatrolene-hry.cz/spolecenska-hra/vlkodlaci-z-temneho-hvozdu-1147/'),
  (4652, 'Výbušná koťátka', 2015, 'assets/deskovky/4652.jpg', 'https://www.zatrolene-hry.cz/spolecenska-hra/vybusna-kotatka-4652/'),
  (4253, 'YES', 2004, 'assets/deskovky/4253.jpg', 'https://www.zatrolene-hry.cz/spolecenska-hra/yes-4253/'),
  (9469, 'Zbodni salát', 2019, 'assets/deskovky/9469.jpg', 'https://www.zatrolene-hry.cz/spolecenska-hra/zbodni-salat-9469/'),
  (3901, 'Zima mrtvých: Cesty osudu', 2014, 'assets/deskovky/3901.jpg', 'https://www.zatrolene-hry.cz/spolecenska-hra/zima-mrtvych-cesty-osudu-3901/')
on conflict (zh_id) do nothing;
