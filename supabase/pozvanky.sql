-- ============================================================
-- Pozvánkové kódy: registrace nových členů bez práce v Supabase
--
-- Jak to funguje:
--   1. Admin si na webu (Přehled) vytvoří jednorázový kód.
--   2. Kód platí 7 dní a jen na jedno použití.
--   3. Zájemce se s ním na stránce registrace.html sám
--      zaregistruje (e-mail, heslo, přezdívka).
--
-- POUŽITÍ: celý soubor spusťte v Supabase SQL Editoru (Run).
-- Dále je potřeba v Authentication -> Sign In / Up:
--   - zapnout "Allow new users to sign up"
--   - vypnout "Confirm email" (registraci hlídá pozvánka)
--
-- POZOR: po spuštění už NEJDE zakládat účty ručně tlačítkem
-- "Add user" v administraci (registrace vyžaduje platný kód).
-- Chcete-li účet založit ručně, vytvořte si prostě pozvánku.
-- ============================================================

-- 1) Tabulka pozvánek
create table public.pozvanky (
  kod       text primary key check (char_length(kod) between 6 and 20),
  vytvoril  uuid references public.profily (id) on delete set null,
  vytvoreno timestamptz not null default now(),
  plati_do  timestamptz not null default now() + interval '7 days',
  pouzito   timestamptz,
  pouzil    uuid references public.profily (id) on delete set null
);

alter table public.pozvanky enable row level security;

-- Pozvánky vidí a spravuje jen admin
create policy "admin vidi pozvanky"
  on public.pozvanky for select to authenticated
  using (public.je_admin());

create policy "admin tvori pozvanky"
  on public.pozvanky for insert to authenticated
  with check (public.je_admin() and vytvoril = auth.uid());

create policy "admin maze pozvanky"
  on public.pozvanky for delete to authenticated
  using (public.je_admin());

-- 2) Ověření kódu před registrací (smí volat i nepřihlášený,
--    vrací jen ano/ne, obsah tabulky tím neprozradí)
create or replace function public.over_pozvanku(kod_pozvanky text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.pozvanky
    where kod = kod_pozvanky
      and pouzito is null
      and plati_do > now()
  );
$$;

grant execute on function public.over_pozvanku(text) to anon, authenticated;

-- 3) Nová verze automatiky při registraci:
--    bez platné pozvánky registraci odmítne, s platnou
--    založí profil a pozvánku označí jako použitou
create or replace function public.novy_uzivatel()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  kod_pozvanky text;
begin
  kod_pozvanky := new.raw_user_meta_data ->> 'pozvanka';

  -- Označení pozvánky jako použité; podmínky zaručí,
  -- že jeden kód projde jen jednou a jen v době platnosti
  update public.pozvanky
     set pouzito = now()
   where kod = kod_pozvanky
     and pouzito is null
     and plati_do > now();

  if not found then
    raise exception 'Registrace je možná jen s platnou pozvánkou.';
  end if;

  insert into public.profily (id, prezdivka)
  values (
    new.id,
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'prezdivka'), ''),
      split_part(new.email, '@', 1)
    )
  );

  update public.pozvanky set pouzil = new.id where kod = kod_pozvanky;

  return new;
end;
$$;
