-- ============================================================
-- Role "vedeni" + úpravy příspěvků a akcí
--
-- Co skript dělá:
--   1. Přidá roli 'vedeni' (mezi 'clen' a 'admin').
--   2. Nová práva:
--      - akce zakládá a upravuje JEN vedení a admin
--      - každý upravuje svůj vlastní příspěvek
--      - cizí obsah (zprávy, příspěvky, obrázky) maže jen vedení a admin
--      - pozvánky spravuje vedení i admin
--   3. Přidá sloupec "upraveno" u příspěvků a akcí.
--
-- POUŽITÍ: celý soubor spusťte v Supabase SQL Editoru (Run).
-- Roli členovi přidělíte SQL příkazem (viz NAVOD.md, krok 5).
-- ============================================================

-- 1) Rozšíření povolených rolí o 'vedeni'
alter table public.profily drop constraint if exists profily_role_check;
alter table public.profily
  add constraint profily_role_check check (role in ('clen', 'vedeni', 'admin'));

-- 2) Pomocná funkce: je přihlášený člen vedení nebo admin?
create or replace function public.je_vedeni()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profily
    where id = auth.uid() and role in ('vedeni', 'admin')
  );
$$;

-- 3) Sloupec "upraveno" (kdy byl obsah naposledy změněn)
alter table public.prispevky add column if not exists upraveno timestamptz;
alter table public.akce      add column if not exists upraveno timestamptz;

-- 4) AKCE: zakládá a upravuje jen vedení a admin
drop policy if exists "clen vytvori akci" on public.akce;
create policy "vedeni vytvori akci"
  on public.akce for insert to authenticated
  with check (autor = auth.uid() and public.je_vedeni());

create policy "vedeni upravi akci"
  on public.akce for update to authenticated
  using (public.je_vedeni()) with check (public.je_vedeni());

drop policy if exists "autor nebo admin smaze akci" on public.akce;
create policy "autor nebo vedeni smaze akci"
  on public.akce for delete to authenticated
  using (autor = auth.uid() or public.je_vedeni());

-- 5) ZPRÁVY: cizí maže jen vedení a admin
drop policy if exists "autor nebo admin smaze zpravu" on public.zpravy;
create policy "autor nebo vedeni smaze zpravu"
  on public.zpravy for delete to authenticated
  using (autor = auth.uid() or public.je_vedeni());

-- 6) PŘÍSPĚVKY: cizí maže jen vedení a admin
--    (úpravu vlastního příspěvku už pravidlo
--    "autor upravi svuj prispevek" povoluje)
drop policy if exists "autor nebo admin smaze prispevek" on public.prispevky;
create policy "autor nebo vedeni smaze prispevek"
  on public.prispevky for delete to authenticated
  using (autor = auth.uid() or public.je_vedeni());

-- 7) POZVÁNKY: spravuje vedení i admin
drop policy if exists "admin vidi pozvanky" on public.pozvanky;
create policy "vedeni vidi pozvanky"
  on public.pozvanky for select to authenticated
  using (public.je_vedeni());

drop policy if exists "admin tvori pozvanky" on public.pozvanky;
create policy "vedeni tvori pozvanky"
  on public.pozvanky for insert to authenticated
  with check (public.je_vedeni() and vytvoril = auth.uid());

drop policy if exists "admin maze pozvanky" on public.pozvanky;
create policy "vedeni maze pozvanky"
  on public.pozvanky for delete to authenticated
  using (public.je_vedeni());

-- 8) ÚLOŽIŠTĚ: cizí obrázky a avatary maže jen vedení a admin
drop policy if exists "autor nebo admin smaze obrazek" on storage.objects;
create policy "autor nebo vedeni smaze obrazek"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'prispevky-obrazky'
    and (owner = auth.uid() or public.je_vedeni())
  );

drop policy if exists "clen nebo admin smaze avatar" on storage.objects;
create policy "clen nebo vedeni smaze avatar"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'avatary'
    and (owner = auth.uid() or public.je_vedeni())
  );
