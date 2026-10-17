/**
 * Estimate <-> Supabase rows. Only engine INPUTS are stored; every load re-validates
 * through the engine's zod schemas, and outputs are recomputed by forecast().
 */
import { EstimateSchema, type Estimate } from '@ai-credits/engine';
import { supabase } from './supabase';

export interface EstimateSummary {
  id: string;
  name: string;
  customerName: string | null;
  rateCardVersion: string;
  updatedAt: string;
}

export async function listEstimates(): Promise<EstimateSummary[]> {
  const { data, error } = await supabase
    .from('estimates')
    .select('id, name, customer_name, rate_card_version, updated_at')
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return data.map((r) => ({
    id: r.id,
    name: r.name,
    customerName: r.customer_name,
    rateCardVersion: r.rate_card_version,
    updatedAt: r.updated_at,
  }));
}

export async function loadEstimate(id: string): Promise<Estimate> {
  const { data, error } = await supabase
    .from('estimates')
    .select('id, name, customer_name, rate_card_version, assumptions, parent_estimate_id, line_items(id, product, label, sort_order, inputs)')
    .eq('id', id)
    .single();
  if (error) throw error;
  return EstimateSchema.parse({
    id: data.id,
    name: data.name,
    customerName: data.customer_name ?? undefined,
    rateCardVersion: data.rate_card_version,
    assumptions: data.assumptions,
    parentEstimateId: data.parent_estimate_id ?? undefined,
    lineItems: (data.line_items ?? []).map((li) => ({
      id: li.id,
      product: li.product,
      label: li.label,
      sortOrder: li.sort_order,
      inputs: li.inputs,
    })),
  });
}

/** Validates, then upserts the estimate and replaces its line items atomically (RPC save_estimate). */
export async function saveEstimate(estimate: Estimate, opts: { isNew: boolean }): Promise<string> {
  const valid = EstimateSchema.parse(estimate);
  const { data, error } = await supabase.rpc('save_estimate', {
    p_estimate: {
      id: opts.isNew ? null : valid.id,
      name: valid.name,
      customerName: valid.customerName ?? null,
      rateCardVersion: valid.rateCardVersion,
      assumptions: valid.assumptions,
      parentEstimateId: valid.parentEstimateId ?? null,
      lineItems: valid.lineItems.map(({ product, label, sortOrder, inputs }) => ({ product, label, sortOrder, inputs })),
    },
  });
  if (error) throw error;
  return data as string;
}

export async function deleteEstimate(id: string): Promise<void> {
  const { error } = await supabase.from('estimates').delete().eq('id', id);
  if (error) throw error;
}
