-- ============================================================
-- Rozměry obrázku u příspěvku (proti "poskakování" stránky)
--
-- Prohlížeč potřebuje znát poměr stran obrázku ještě předtím, než se
-- stáhne, aby mu dokázal rovnou vyhradit správně velké místo. Bez toho
-- se obsah pod obrázkem při načítání krátce posune, jakmile se obrázek
-- objeví.
--
-- POUŽITÍ: celý soubor spusťte v Supabase SQL Editoru (Run).
-- Stávající příspěvky rozměry mít nebudou (sloupce zůstanou prázdné) —
-- chovají se úplně stejně jako dosud, jen nové příspěvky s obrázkem
-- se od teď načtou bez poskočení.
-- ============================================================

alter table public.prispevky add column if not exists sirka_obrazku int;
alter table public.prispevky add column if not exists vyska_obrazku int;
