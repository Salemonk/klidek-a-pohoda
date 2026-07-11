-- ============================================================
-- Obrázky u příspěvků — úložiště (Supabase Storage)
--
-- POUŽITÍ: celý soubor spusťte v Supabase SQL Editoru (Run).
-- Vytvoří soukromé úložiště obrázků a pravidla přístupu:
--   - vidí je jen přihlášení členové
--   - nahrávat může každý člen (jen do vlastní složky)
--   - mazat může autor nebo admin
-- ============================================================

-- 1) Sloupec pro cestu k obrázku u příspěvku
alter table public.prispevky add column if not exists obrazek text;

-- 2) Soukromé úložiště (bucket) pro obrázky
insert into storage.buckets (id, name, public)
values ('prispevky-obrazky', 'prispevky-obrazky', false)
on conflict (id) do nothing;

-- 3) Pravidla přístupu k souborům v úložišti
create policy "cleni ctou obrazky prispevku"
  on storage.objects for select to authenticated
  using (bucket_id = 'prispevky-obrazky');

create policy "clen nahraje obrazek do sve slozky"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'prispevky-obrazky'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "autor nebo admin smaze obrazek"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'prispevky-obrazky'
    and (owner = auth.uid() or public.je_admin())
  );
