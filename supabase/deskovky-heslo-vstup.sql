-- ============================================================
-- DESKOVKY: heslo při vstupu do sekce (místo hesla u přihlášky)
--
-- Spouští se jednou PO skriptu deskovky.sql.
--
-- Co mění:
--  - Návštěvník bez účtu (anon) už nečte tabulky přímo. Data dostane
--    jen přes funkci deskovky_data(heslo), která ověří heslo skupiny.
--  - Přihlášený člen guildy (authenticated) čte tabulky přímo jako dřív
--    a heslo nezadává nikde.
--  - Heslo se ověřuje stejnou funkcí i při přihlášce na hraní, ale web
--    ho tam posílá sám (zapamatované ze vstupu), návštěvník ho znovu
--    nepíše. Bez nastaveného hesla je sekce otevřená všem.
-- ============================================================


-- 1) Heslo platí jen pro návštěvníky bez účtu: přihlášený člen guildy
--    (auth.uid() není prázdné) projde vždy
create or replace function public.deskovky_over_heslo(p_heslo text)
returns boolean language sql stable security definer set search_path = public
as $$
  select auth.uid() is not null
      or coalesce((select heslo_hash is null
                          or heslo_hash = public.deskovky_otisk(btrim(coalesce(p_heslo, '')))
                   from public.deskovky_nastaveni where id = 1), true)
$$;


-- 2) Čtení tabulek jen pro přihlášené členy guildy
drop policy if exists "kdokoli cte hry"       on public.deskovky_hry;
drop policy if exists "kdokoli cte akce"      on public.deskovky_akce;
drop policy if exists "kdokoli cte hry akci"  on public.deskovky_akce_hry;
drop policy if exists "kdokoli cte prihlasky" on public.deskovky_prihlasky;
drop policy if exists "kdokoli cte hlasy"     on public.deskovky_hlasy;
drop policy if exists "clenove ctou hry"       on public.deskovky_hry;
drop policy if exists "clenove ctou akce"      on public.deskovky_akce;
drop policy if exists "clenove ctou hry akci"  on public.deskovky_akce_hry;
drop policy if exists "clenove ctou prihlasky" on public.deskovky_prihlasky;
drop policy if exists "clenove ctou hlasy"     on public.deskovky_hlasy;

create policy "clenove ctou hry" on public.deskovky_hry
  for select to authenticated using (true);
create policy "clenove ctou akce" on public.deskovky_akce
  for select to authenticated using (true);
create policy "clenove ctou hry akci" on public.deskovky_akce_hry
  for select to authenticated using (true);
create policy "clenove ctou prihlasky" on public.deskovky_prihlasky
  for select to authenticated using (true);
create policy "clenove ctou hlasy" on public.deskovky_hlasy
  for select to authenticated using (true);

revoke select on public.deskovky_hry, public.deskovky_akce, public.deskovky_akce_hry,
                 public.deskovky_hlasy, public.deskovky_prihlasky from anon;
-- Sloupcové právo z deskovky.sql se tabulkovým revoke neodebere, proto zvlášť
revoke select (id, akce_id, jmeno, vytvoreno) on public.deskovky_prihlasky from anon;


-- 3) Všechna data sekce najednou pro návštěvníka s heslem.
--    Tvar odpovídá dotazu, který používá web pro přihlášené členy.
create or replace function public.deskovky_data(p_heslo text default null)
returns json
language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.deskovky_over_heslo(p_heslo) then
    raise exception 'spatne_heslo';
  end if;

  return json_build_object(
    'hry', coalesce((
      select json_agg(json_build_object(
        'id', h.id, 'nazev', h.nazev, 'rok', h.rok, 'obrazek', h.obrazek, 'odkaz', h.odkaz))
      from public.deskovky_hry h), '[]'::json),
    'akce', coalesce((
      select json_agg(json_build_object(
        'id', a.id, 'nazev', a.nazev, 'datum', a.datum, 'misto', a.misto,
        'popis', a.popis, 'kapacita', a.kapacita,
        'deskovky_akce_hry', coalesce((
          select json_agg(json_build_object('hra_id', ah.hra_id))
          from public.deskovky_akce_hry ah where ah.akce_id = a.id), '[]'::json),
        'deskovky_prihlasky', coalesce((
          select json_agg(json_build_object(
            'id', p.id, 'jmeno', p.jmeno, 'vytvoreno', p.vytvoreno,
            'deskovky_hlasy', coalesce((
              select json_agg(json_build_object('hra_id', hl.hra_id))
              from public.deskovky_hlasy hl where hl.prihlaska_id = p.id), '[]'::json)
          ) order by p.vytvoreno)
          from public.deskovky_prihlasky p where p.akce_id = a.id), '[]'::json)
      ) order by a.datum)
      from public.deskovky_akce a), '[]'::json)
  );
end;
$$;

revoke execute on function public.deskovky_data(text) from public;
grant execute on function public.deskovky_data(text) to anon, authenticated;
