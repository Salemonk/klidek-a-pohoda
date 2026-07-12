-- ============================================================
-- Přehled členů pro admina + změna rolí z webu
--
-- Co skript dělá:
--   1. seznam_clenu(): vrátí adminovi seznam členů včetně
--      e-mailu a data posledního přihlášení (z auth.users).
--   2. nastav_roli(): bezpečná změna role člena z webu.
--      Smí ji volat jen admin a nemůže změnit roli sám sobě
--      (aby se omylem nesesadil).
--
-- POUŽITÍ: celý soubor spusťte v Supabase SQL Editoru (Run).
-- ============================================================

-- 1) Seznam členů (jen pro admina; ostatním vrátí prázdný výsledek)
create or replace function public.seznam_clenu()
returns table (
  id                  uuid,
  prezdivka           text,
  role                text,
  avatar              text,
  email               text,
  clenem_od           timestamptz,
  posledni_prihlaseni timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.prezdivka, p.role, p.avatar,
         u.email::text, p.vytvoreno, u.last_sign_in_at
  from public.profily p
  join auth.users u on u.id = p.id
  where public.je_admin()
  order by p.vytvoreno;
$$;

grant execute on function public.seznam_clenu() to authenticated;

-- 2) Změna role člena (jen admin, ne sám sobě)
create or replace function public.nastav_roli(clen_id uuid, nova_role text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.je_admin() then
    raise exception 'Role smí měnit jen admin.';
  end if;

  if nova_role not in ('clen', 'vedeni', 'admin') then
    raise exception 'Neznámá role: %', nova_role;
  end if;

  if clen_id = auth.uid() then
    raise exception 'Vlastní roli si změnit nemůžete.';
  end if;

  update public.profily set role = nova_role where id = clen_id;
end;
$$;

grant execute on function public.nastav_roli(uuid, text) to authenticated;
