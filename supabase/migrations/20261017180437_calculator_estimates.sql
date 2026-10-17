-- estimates + line_items tables, grants, RLS enabled (policies in the next migration).

-- ---------------------------------------------------------------------------
-- estimates + line_items
-- ---------------------------------------------------------------------------
create table public.estimates (
  id                 uuid primary key default gen_random_uuid(),
  owner_id           uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name               text not null check (length(name) between 1 and 200),
  customer_name      text,
  rate_card_version  text not null,
  assumptions        jsonb not null,
  -- Set when duplicated from another estimate ("save as new version").
  parent_estimate_id uuid references public.estimates(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index estimates_owner_updated_idx on public.estimates (owner_id, updated_at desc);
create index estimates_parent_idx on public.estimates (parent_estimate_id);

create table public.line_items (
  id          uuid primary key default gen_random_uuid(),
  estimate_id uuid not null references public.estimates(id) on delete cascade,
  owner_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  product     text not null check (product in ('cowork', 'copilotStudio', 'powerPlatformAi', 'githubCopilot')),
  label       text not null check (length(label) between 1 and 200),
  sort_order  integer not null,
  inputs      jsonb not null,
  created_at  timestamptz not null default now()
);
create index line_items_estimate_idx on public.line_items (estimate_id, sort_order);
create index line_items_owner_idx on public.line_items (owner_id);

create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end; $$;

create trigger estimates_touch before update on public.estimates
  for each row execute function public.touch_updated_at();

-- Explicit Data API grants (RLS still decides which rows). anon gets nothing.
revoke all on public.estimates, public.line_items from anon;
grant select, insert, update, delete on public.estimates  to authenticated;
grant select, insert, update, delete on public.line_items to authenticated;
alter table public.estimates  enable row level security;
alter table public.line_items enable row level security;
