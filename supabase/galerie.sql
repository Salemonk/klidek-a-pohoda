-- ============================================================
-- Galerie momentek: síň slávy se screenshoty z akcí
--
-- Volná galerie (bez vazby na konkrétní akci): obrázek + nepovinný
-- popisek. Nahrát může každý člen, mazat autor nebo vedení/admin.
--
-- POUŽITÍ: celý soubor spusťte v Supabase SQL Editoru (Run).
-- Předpoklad: běží role-vedeni-a-upravy.sql (kvůli funkci je_vedeni()).
-- ============================================================

-- 1) Tabulka momentek
create table public.momentky (
  id        bigint generated always as identity primary key,
  autor     uuid references public.profily (id) on delete set null,
  obrazek   text not null,
  popisek   text check (char_length(popisek) <= 200),
  vytvoreno timestamptz not null default now()
);

alter table public.momentky enable row level security;

create policy "cleni ctou momentky"
  on public.momentky for select to authenticated using (true);

create policy "clen prida momentku"
  on public.momentky for insert to authenticated
  with check (autor = auth.uid());

create policy "autor nebo vedeni smaze momentku"
  on public.momentky for delete to authenticated
  using (autor = auth.uid() or public.je_vedeni());

-- 2) Soukromé úložiště obrázků galerie
insert into storage.buckets (id, name, public)
values ('galerie', 'galerie', false)
on conflict (id) do nothing;

create policy "cleni ctou galerii"
  on storage.objects for select to authenticated
  using (bucket_id = 'galerie');

create policy "clen nahraje do galerie"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'galerie'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "autor nebo vedeni smaze z galerie"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'galerie'
    and (owner = auth.uid() or public.je_vedeni())
  );
