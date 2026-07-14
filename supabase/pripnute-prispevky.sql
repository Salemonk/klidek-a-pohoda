-- ============================================================
-- Připnuté příspěvky na nástěnce
--
-- Vedení (nebo admin) může příspěvek připnout nahoru na nástěnku.
-- Připnuté příspěvky se řadí jako první, pak podle data jako dřív.
--
-- POUŽITÍ: celý soubor spusťte v Supabase SQL Editoru (Run).
-- Předpoklad: běží role-vedeni-a-upravy.sql (kvůli funkci je_vedeni()).
-- ============================================================

alter table public.prispevky add column if not exists pripnuto boolean not null default false;

-- Připínat/odepínat smí jen vedení a admin (úpravu vlastního textu
-- příspěvku dál povoluje existující pravidlo "autor upravi svuj prispevek")
create policy "vedeni pripne prispevek"
  on public.prispevky for update to authenticated
  using (public.je_vedeni()) with check (public.je_vedeni());
