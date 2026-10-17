-- AI Credits Forecast Calculator: profiles, estimates, line_items, RLS, atomic save.
--
-- Persisted shape = engine INPUTS only. Outputs are recomputed on load from inputs +
-- the pinned rate card (shipped in @ai-credits/engine), so a rate change never
-- silently alters a saved forecast. `assumptions` and `inputs` are jsonb and are
-- validated by the engine's zod schemas on the client before save and again on load.
--
-- Authorization: owner-only on every table. No admin or cross-customer access in v1.

-- ---------------------------------------------------------------------------
-- profiles: one row per auth user; organisation captured at sign-up
-- ---------------------------------------------------------------------------
create table public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  email        text,
  organisation text,
  created_at   timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email, organisation)
  values (new.id, new.email, nullif(new.raw_user_meta_data ->> 'organisation', ''))
  on conflict (id) do nothing;
  return new;
end; $$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

revoke all on public.profiles from anon;
grant select, update on public.profiles to authenticated;
alter table public.profiles enable row level security;

create policy profiles_select_own on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy profiles_update_own on public.profiles
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));
