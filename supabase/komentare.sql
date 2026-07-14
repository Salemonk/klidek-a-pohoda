-- ============================================================
-- Komentáře k příspěvkům na nástěnce
--
-- POUŽITÍ: celý soubor spusťte v Supabase SQL Editoru (Run).
-- Každý člen může k příspěvku napsat JEDEN komentář (vynucuje
-- složený primární klíč), svůj komentář může upravit nebo smazat.
-- Cizí komentáře smí mazat vedení a admin (moderace).
--
-- Předpoklad: běží role-vedeni-a-upravy.sql (kvůli funkci je_vedeni).
-- ============================================================

create table public.komentare (
  prispevek_id bigint not null references public.prispevky (id) on delete cascade,
  clen_id      uuid   not null references public.profily (id) on delete cascade,
  text         text   not null check (char_length(text) between 1 and 500),
  vytvoreno    timestamptz not null default now(),
  upraveno     timestamptz,
  primary key (prispevek_id, clen_id)
);

alter table public.komentare enable row level security;

create policy "cleni ctou komentare"
  on public.komentare for select to authenticated using (true);

create policy "clen komentuje za sebe"
  on public.komentare for insert to authenticated
  with check (clen_id = auth.uid());

create policy "clen upravi svuj komentar"
  on public.komentare for update to authenticated
  using (clen_id = auth.uid()) with check (clen_id = auth.uid());

create policy "autor nebo vedeni smaze komentar"
  on public.komentare for delete to authenticated
  using (clen_id = auth.uid() or public.je_vedeni());
