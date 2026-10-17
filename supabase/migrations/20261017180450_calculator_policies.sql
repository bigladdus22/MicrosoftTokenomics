-- Owner-only RLS policies for estimates and line_items.

create policy estimates_select_own on public.estimates
  for select to authenticated using (owner_id = (select auth.uid()));
create policy estimates_insert_own on public.estimates
  for insert to authenticated with check (owner_id = (select auth.uid()));
create policy estimates_update_own on public.estimates
  for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy estimates_delete_own on public.estimates
  for delete to authenticated using (owner_id = (select auth.uid()));

-- A line item must belong to the caller AND hang off an estimate the caller owns.
create policy line_items_select_own on public.line_items
  for select to authenticated using (owner_id = (select auth.uid()));
create policy line_items_insert_own on public.line_items
  for insert to authenticated with check (
    owner_id = (select auth.uid())
    and exists (select 1 from public.estimates e where e.id = estimate_id and e.owner_id = (select auth.uid()))
  );
create policy line_items_update_own on public.line_items
  for update to authenticated using (owner_id = (select auth.uid())) with check (
    owner_id = (select auth.uid())
    and exists (select 1 from public.estimates e where e.id = estimate_id and e.owner_id = (select auth.uid()))
  );
create policy line_items_delete_own on public.line_items
  for delete to authenticated using (owner_id = (select auth.uid()));
