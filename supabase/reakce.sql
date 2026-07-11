-- ============================================================
-- Reakce smajlíkem na příspěvky
--
-- POUŽITÍ: celý soubor spusťte v Supabase SQL Editoru (Run).
-- Každý člen může na příspěvek přidat libovolné smajlíky
-- (každý smajlík jednou) a zase je odebrat.
-- ============================================================

create table public.reakce (
  prispevek_id bigint not null references public.prispevky (id) on delete cascade,
  clen_id      uuid   not null references public.profily (id) on delete cascade,
  emoji        text   not null check (char_length(emoji) between 1 and 16),
  vytvoreno    timestamptz not null default now(),
  primary key (prispevek_id, clen_id, emoji)
);

alter table public.reakce enable row level security;

create policy "cleni ctou reakce"
  on public.reakce for select to authenticated using (true);

create policy "clen reaguje za sebe"
  on public.reakce for insert to authenticated
  with check (clen_id = auth.uid());

create policy "clen odebere svou reakci"
  on public.reakce for delete to authenticated
  using (clen_id = auth.uid());
