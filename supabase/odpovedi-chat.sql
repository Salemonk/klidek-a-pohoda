-- ============================================================
-- Odpověď na zprávu v chatu (citace)
--
-- Přidá sloupec, do kterého se uloží ID zprávy, na niž člen
-- odpovídá. Žádná nová RLS pravidla nejsou potřeba — stávající
-- pravidla u tabulky zpravy platí na celý řádek.
--
-- POUŽITÍ: celý soubor spusťte v Supabase SQL Editoru (Run).
-- ============================================================

alter table public.zpravy
  add column if not exists odpoved_na bigint references public.zpravy (id) on delete set null;
