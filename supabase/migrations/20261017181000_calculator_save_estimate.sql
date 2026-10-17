-- ---------------------------------------------------------------------------
-- save_estimate: upsert an estimate and replace its line items in one transaction.
-- SECURITY INVOKER, so every statement runs under the caller's RLS policies.
-- p_estimate: { id?, name, customerName?, rateCardVersion, assumptions, parentEstimateId?,
--               lineItems: [{ product, label, sortOrder, inputs }] }
-- Returns the estimate id.
-- ---------------------------------------------------------------------------
create or replace function public.save_estimate(p_estimate jsonb)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  v_id uuid := coalesce(nullif(p_estimate ->> 'id', '')::uuid, gen_random_uuid());
begin
  insert into public.estimates (id, name, customer_name, rate_card_version, assumptions, parent_estimate_id)
  values (
    v_id,
    p_estimate ->> 'name',
    p_estimate ->> 'customerName',
    p_estimate ->> 'rateCardVersion',
    p_estimate -> 'assumptions',
    nullif(p_estimate ->> 'parentEstimateId', '')::uuid
  )
  on conflict (id) do update set
    name              = excluded.name,
    customer_name     = excluded.customer_name,
    rate_card_version = excluded.rate_card_version,
    assumptions       = excluded.assumptions;

  -- Defence in depth: RLS already rejects an upsert onto another owner's id; if the
  -- row is still not visible to the caller, refuse rather than write orphans.
  if not exists (select 1 from public.estimates where id = v_id) then
    raise exception 'estimate % not found', v_id using errcode = '42501';
  end if;

  delete from public.line_items where estimate_id = v_id;

  insert into public.line_items (estimate_id, product, label, sort_order, inputs)
  select v_id, li ->> 'product', li ->> 'label', (li ->> 'sortOrder')::int, li -> 'inputs'
  from jsonb_array_elements(coalesce(p_estimate -> 'lineItems', '[]'::jsonb)) as li;

  return v_id;
end; $$;

revoke execute on function public.save_estimate(jsonb) from public, anon;
grant execute on function public.save_estimate(jsonb) to authenticated;
