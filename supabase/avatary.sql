-- ============================================================
-- Avatary členů: úložiště a sloupec v profilu
--
-- POUŽITÍ: celý soubor spusťte v Supabase SQL Editoru (Run).
--   - avatar si každý člen nahrává a mění sám (jen ten svůj)
--   - vidí je jen přihlášení členové
-- ============================================================

-- 1) Sloupec pro cestu k avataru v profilu
alter table public.profily add column if not exists avatar text;

-- Členové smí přes web měnit jen přezdívku, přidáme i avatar
grant update (avatar) on public.profily to authenticated;

-- 2) Soukromé úložiště avatarů
insert into storage.buckets (id, name, public)
values ('avatary', 'avatary', false)
on conflict (id) do nothing;

-- 3) Pravidla přístupu
create policy "cleni ctou avatary"
  on storage.objects for select to authenticated
  using (bucket_id = 'avatary');

create policy "clen nahraje svuj avatar"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'avatary'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "clen prepise svuj avatar"
  on storage.objects for update to authenticated
  using (bucket_id = 'avatary' and owner = auth.uid())
  with check (
    bucket_id = 'avatary'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "clen nebo admin smaze avatar"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'avatary'
    and (owner = auth.uid() or public.je_admin())
  );
