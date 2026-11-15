alter table public.repository_entries
  alter column enabled drop default,
  alter column empty drop default,
  alter column lfs drop default,
  alter column pages drop default,
  alter column root drop default;
