import { useEffect, useMemo, useState } from 'react';
import {
  LineItemSchema,
  forecast,
  getRateCard,
  type Assumptions,
  type Estimate,
  type EstimateForecast,
  type LineItem,
  type ProductId,
} from '@ai-credits/engine';
import { ZodError } from 'zod';
import { CURRENT_RATE_CARD, PRODUCT_LABELS, newLineItem } from '../lib/defaults';
import { saveEstimate } from '../lib/persistence';
import { ForecastView } from './ForecastView';

interface Props {
  initial: Estimate;
  isNew: boolean;
  onSaved: (id: string) => void;
  onClose: () => void;
}

const PRODUCTS: ProductId[] = ['cowork', 'copilotStudio', 'powerPlatformAi', 'githubCopilot'];

function describe(e: unknown): string {
  if (e instanceof ZodError) return e.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
  return e instanceof Error ? e.message : String(e);
}

export function EstimateBuilder({ initial, isNew, onSaved, onClose }: Props) {
  const [estimate, setEstimate] = useState<Estimate>(initial);
  const [status, setStatus] = useState<string | null>(null);
  const rateCard = getRateCard(estimate.rateCardVersion) ?? CURRENT_RATE_CARD;

  const result = useMemo<{ ok: EstimateForecast } | { err: string }>(() => {
    try {
      return { ok: forecast(estimate, rateCard) };
    } catch (e) {
      return { err: describe(e) };
    }
  }, [estimate, rateCard]);

  const setAssumption = <K extends keyof Assumptions>(k: K, v: Assumptions[K]) =>
    setEstimate((e) => ({ ...e, assumptions: { ...e.assumptions, [k]: v } }));

  const setLineItem = (id: string, next: LineItem) =>
    setEstimate((e) => ({ ...e, lineItems: e.lineItems.map((li) => (li.id === id ? next : li)) }));

  const addLineItem = (p: ProductId) =>
    setEstimate((e) => ({ ...e, lineItems: [...e.lineItems, newLineItem(p, e.lineItems.length)] }));

  const removeLineItem = (id: string) =>
    setEstimate((e) => ({ ...e, lineItems: e.lineItems.filter((li) => li.id !== id) }));

  async function save(asNewVersion: boolean) {
    setStatus('Saving…');
    try {
      const toSave = asNewVersion ? { ...estimate, parentEstimateId: estimate.id, name: `${estimate.name} (copy)` } : estimate;
      const id = await saveEstimate(toSave, { isNew: isNew || asNewVersion });
      setStatus('Saved.');
      onSaved(id);
    } catch (e) {
      setStatus(`Save failed: ${describe(e)}`);
    }
  }

  function exportJson() {
    const file = {
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      estimate,
      rateCardSnapshot: rateCard,
      computed: 'ok' in result ? result.ok : undefined,
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: `${estimate.name}.json` });
    a.click();
    URL.revokeObjectURL(url);
  }

  const a = estimate.assumptions;
  return (
    <>
      <section className="card">
        <header className="row">
          <button type="button" className="link" onClick={onClose}>
            ← All estimates
          </button>
          <div className="actions">
            <button type="button" onClick={exportJson}>
              Export JSON
            </button>
            {!isNew && (
              <button type="button" onClick={() => save(true)}>
                Save as new version
              </button>
            )}
            <button type="button" className="primary" onClick={() => save(false)}>
              Save
            </button>
          </div>
        </header>
        {status && <p className="notice">{status}</p>}

        <div className="grid">
          <label>
            Estimate name
            <input value={estimate.name} onChange={(e) => setEstimate({ ...estimate, name: e.target.value })} />
          </label>
          <label>
            Customer
            <input
              value={estimate.customerName ?? ''}
              onChange={(e) => setEstimate({ ...estimate, customerName: e.target.value || undefined })}
            />
          </label>
          <label>
            Horizon (months)
            <input type="number" min={1} max={36} value={a.horizonMonths} onChange={(e) => setAssumption('horizonMonths', Number(e.target.value))} />
          </label>
          <label>
            Growth per month (%)
            <input
              type="number"
              step="0.5"
              value={+(a.growthPercentPerMonth * 100).toFixed(4)}
              onChange={(e) => setAssumption('growthPercentPerMonth', Number(e.target.value) / 100)}
            />
          </label>
          <label>
            M365 Copilot-licensed share (%)
            <input
              type="number"
              min={0}
              max={100}
              value={+(a.m365CopilotLicensedShare * 100).toFixed(4)}
              onChange={(e) => setAssumption('m365CopilotLicensedShare', Number(e.target.value) / 100)}
            />
          </label>
          <label>
            Commitment
            <select value={a.commitmentPreference} onChange={(e) => setAssumption('commitmentPreference', e.target.value as Assumptions['commitmentPreference'])}>
              <option value="auto">Cheapest priced option</option>
              <option value="none">Pay-as-you-go only</option>
              <option value="packs">Capacity packs</option>
              <option value="p3">Pre-purchase (P3)</option>
            </select>
          </label>
          <label>
            Currency
            <select value={a.currency} onChange={(e) => setAssumption('currency', e.target.value as Assumptions['currency'])}>
              <option value="USD">USD</option>
              <option value="GBP">GBP</option>
            </select>
          </label>
        </div>
      </section>

      <section className="card">
        <header className="row">
          <h2>Products</h2>
          <div className="actions">
            {PRODUCTS.map((p) => (
              <button type="button" key={p} onClick={() => addLineItem(p)}>
                + {PRODUCT_LABELS[p]}
              </button>
            ))}
          </div>
        </header>
        {estimate.lineItems.length === 0 && <p className="muted">Add a product to start forecasting.</p>}
        {estimate.lineItems.map((li) => (
          <LineItemEditor key={li.id} item={li} onChange={(n) => setLineItem(li.id, n)} onRemove={() => removeLineItem(li.id)} />
        ))}
      </section>

      {'ok' in result ? <ForecastView result={result.ok} /> : <p className="error card">Inputs not valid yet: {result.err}</p>}
    </>
  );
}

/**
 * Line-item editor: Cowork gets form fields for its headline inputs; every product keeps
 * the full inputs as JSON (under "Advanced" for Cowork), validated live against the
 * engine's LineItemSchema.
 */
function LineItemEditor({ item, onChange, onRemove }: { item: LineItem; onChange: (n: LineItem) => void; onRemove: () => void }) {
  const pretty = JSON.stringify(item.inputs, null, 2);
  const [text, setText] = useState(pretty);
  const [error, setError] = useState<string | null>(null);

  // Keep the JSON in step when the form fields change it; leave it alone while the
  // user is typing JSON that already parses to the current inputs.
  useEffect(() => {
    try {
      if (JSON.stringify(JSON.parse(text)) === JSON.stringify(item.inputs)) return;
    } catch {
      /* unparseable text: replace it */
    }
    setText(pretty);
    setError(null);
  }, [pretty]);

  function edit(next: string) {
    setText(next);
    try {
      const parsed = LineItemSchema.parse({ ...item, inputs: JSON.parse(next) });
      setError(null);
      onChange(parsed as LineItem);
    } catch (e) {
      setError(describe(e));
    }
  }

  const json = <textarea spellCheck={false} rows={Math.min(24, text.split('\n').length + 1)} value={text} onChange={(e) => edit(e.target.value)} />;

  return (
    <article className="line-item">
      <header className="row">
        <input className="label-input" value={item.label} onChange={(e) => onChange({ ...item, label: e.target.value })} />
        <span className="badge">{PRODUCT_LABELS[item.product]}</span>
        <button type="button" className="link danger" onClick={onRemove}>
          Remove
        </button>
      </header>
      {item.product === 'cowork' ? (
        <>
          <CoworkFields item={item} onChange={onChange} />
          <details>
            <summary className="muted">Advanced (JSON)</summary>
            {json}
          </details>
        </>
      ) : (
        json
      )}
      {error && <p className="error">{error}</p>}
    </article>
  );
}

type CoworkItem = Extract<LineItem, { product: 'cowork' }>;

/** Number input that maps an empty box to `undefined` rather than 0. */
function num(value: string): number | undefined {
  if (value.trim() === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function CoworkFields({ item, onChange }: { item: CoworkItem; onChange: (n: LineItem) => void }) {
  const i = item.inputs;
  const set = (patch: Partial<CoworkItem['inputs']>) => {
    const inputs = { ...i, ...patch };
    if (inputs.creditsPerTaskOverride === undefined) delete inputs.creditsPerTaskOverride;
    onChange({ ...item, inputs });
  };
  const credits = i.creditsPerTaskOverride;
  return (
    <>
      <div className="grid">
        <label>
          Users
          <input type="number" min={0} step={1} value={i.users} onChange={(e) => set({ users: Math.max(0, Math.round(num(e.target.value) ?? 0)) })} />
        </label>
        <label>
          Tasks per user / month
          <input type="number" min={0} value={i.tasksPerUserPerMonth} onChange={(e) => set({ tasksPerUserPerMonth: Math.max(0, num(e.target.value) ?? 0) })} />
        </label>
        <label>
          Credits per task
          <input
            type="number"
            min={0}
            step="any"
            placeholder="from /cost"
            value={credits ?? ''}
            onChange={(e) => {
              const v = num(e.target.value);
              set({ creditsPerTaskOverride: v === undefined ? undefined : Math.max(0, v) });
            }}
          />
        </label>
      </div>
      {credits === undefined ? (
        <p className="muted">
          Cowork has no published per-task credit average. Enter the customer's average from <code>/cost</code> or the Cowork
          estimator (aka.ms/CustomerCoworkEstimator); until then this line is shown as incomplete.
        </p>
      ) : (
        <p className="muted">
          {(i.users * i.tasksPerUserPerMonth * credits).toLocaleString()} Copilot Credits / month, billed on the shared Copilot
          Credits meter.
        </p>
      )}
    </>
  );
}
