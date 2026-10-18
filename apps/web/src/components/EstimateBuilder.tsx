import { useEffect, useMemo, useState } from 'react';
import {
  LineItemSchema,
  forecast,
  getRateCard,
  type Assumptions,
  type Estimate,
  type EstimateForecast,
  type LineItem,
  type LineItemForecast,
  type ProductId,
  type RateCard,
} from '@ai-credits/engine';
import { ZodError } from 'zod';
import { CURRENT_RATE_CARD, PRODUCT_BLURBS, PRODUCT_COLOR_VAR, PRODUCT_LABELS, newLineItem } from '../lib/defaults';
import { saveEstimate } from '../lib/persistence';
import { ForecastView } from './ForecastView';
import { CopilotStudioFields, CoworkFields, GitHubCopilotFields, PowerPlatformAiFields } from './ProductFields';

interface Props {
  initial: Estimate;
  isNew: boolean;
  onSaved: (id: string) => void;
  onClose: () => void;
}

const PRODUCTS: ProductId[] = ['cowork', 'copilotStudio', 'powerPlatformAi', 'githubCopilot'];
const compact = new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 });

function describe(e: unknown): string {
  if (e instanceof ZodError) return e.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
  return e instanceof Error ? e.message : String(e);
}

export function EstimateBuilder({ initial, isNew, onSaved, onClose }: Props) {
  const [estimate, setEstimate] = useState<Estimate>(initial);
  const [status, setStatus] = useState<{ kind: 'idle' | 'saving' | 'saved' | 'error'; text?: string }>({ kind: 'idle' });
  const [dirty, setDirty] = useState(false);
  const [presenting, setPresenting] = useState(false);
  const rateCard = getRateCard(estimate.rateCardVersion) ?? CURRENT_RATE_CARD;

  const result = useMemo<{ ok: EstimateForecast } | { err: string }>(() => {
    try {
      return { ok: forecast(estimate, rateCard) };
    } catch (e) {
      return { err: describe(e) };
    }
  }, [estimate, rateCard]);

  const update = (fn: (e: Estimate) => Estimate) => {
    setEstimate(fn);
    setDirty(true);
  };
  const setAssumption = <K extends keyof Assumptions>(k: K, v: Assumptions[K]) =>
    update((e) => ({ ...e, assumptions: { ...e.assumptions, [k]: v } }));
  const setLineItem = (id: string, next: LineItem) => update((e) => ({ ...e, lineItems: e.lineItems.map((li) => (li.id === id ? next : li)) }));
  const addLineItem = (p: ProductId) => update((e) => ({ ...e, lineItems: [...e.lineItems, newLineItem(p, e.lineItems.length)] }));
  const removeLineItem = (id: string) => update((e) => ({ ...e, lineItems: e.lineItems.filter((li) => li.id !== id) }));

  async function save(asNewVersion: boolean) {
    setStatus({ kind: 'saving' });
    try {
      const toSave = asNewVersion ? { ...estimate, parentEstimateId: estimate.id, name: `${estimate.name} (copy)` } : estimate;
      const id = await saveEstimate(toSave, { isNew: isNew || asNewVersion });
      setStatus({ kind: 'saved' });
      setDirty(false);
      onSaved(id);
    } catch (e) {
      setStatus({ kind: 'error', text: describe(e) });
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

  function close() {
    if (dirty && !window.confirm('Leave without saving your changes?')) return;
    onClose();
  }

  const a = estimate.assumptions;
  const lineForecast = (id: string): LineItemForecast | undefined => ('ok' in result ? result.ok.lineItems.find((l) => l.lineItemId === id) : undefined);
  const saveText =
    status.kind === 'saving' ? 'Saving…' : status.kind === 'error' ? `Save failed: ${status.text}` : dirty ? 'Unsaved changes' : status.kind === 'saved' ? 'Saved' : isNew ? 'Not saved yet' : 'Saved';

  return (
    <>
      <div className="est-head">
        <button type="button" className="subtle" onClick={close} aria-label="Back to all estimates">
          ←
        </button>
        <input
          className="est-title"
          aria-label="Estimate name"
          value={estimate.name}
          onChange={(e) => update((x) => ({ ...x, name: e.target.value }))}
        />
        <span className={`save-state${status.kind === 'error' ? ' error' : ''}`}>{saveText}</span>
        <span className="grow" />
        <button type="button" className="toggle" aria-pressed={presenting} onClick={() => setPresenting((p) => !p)}>
          {presenting ? 'Edit inputs' : 'Present'}
        </button>
        <button type="button" className="subtle" onClick={exportJson}>
          Export
        </button>
        {!isNew && (
          <button type="button" onClick={() => save(true)}>
            Save as copy
          </button>
        )}
        <button type="button" className="primary" onClick={() => save(false)} disabled={status.kind === 'saving'}>
          Save
        </button>
      </div>

      <div className={`workspace${presenting ? ' presenting' : ''}`}>
        <div className="inputs stack">
          <section className="card">
            <div className="section-title">
              <h2>Customer & assumptions</h2>
            </div>
            <div className="grid">
              <label>
                Customer
                <input
                  value={estimate.customerName ?? ''}
                  placeholder="e.g. Contoso Ltd"
                  onChange={(e) => update((x) => ({ ...x, customerName: e.target.value || undefined }))}
                />
              </label>
              <label>
                Term (months)
                <input type="number" min={1} max={36} value={a.horizonMonths} onChange={(e) => setAssumption('horizonMonths', Math.min(36, Math.max(1, Math.round(Number(e.target.value) || 1))))} />
              </label>
              <label title="Applied to every product's usage, compounding monthly.">
                Usage growth per month (%)
                <input
                  type="number"
                  step="0.5"
                  value={+(a.growthPercentPerMonth * 100).toFixed(4)}
                  onChange={(e) => setAssumption('growthPercentPerMonth', Number(e.target.value) / 100)}
                />
              </label>
              <label title="Copilot Studio conversations from Microsoft 365 Copilot-licensed users bill zero credits.">
                M365 Copilot-licensed users (%)
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={+(a.m365CopilotLicensedShare * 100).toFixed(4)}
                  onChange={(e) => setAssumption('m365CopilotLicensedShare', Math.min(100, Math.max(0, Number(e.target.value))) / 100)}
                />
              </label>
              <label>
                How to buy
                <select value={a.commitmentPreference} onChange={(e) => setAssumption('commitmentPreference', e.target.value as Assumptions['commitmentPreference'])}>
                  <option value="auto">Cheapest priced option</option>
                  <option value="none">Pay-as-you-go only</option>
                  <option value="packs">Capacity packs</option>
                  <option value="p3">Pre-purchase plan (P3)</option>
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

          {estimate.lineItems.map((li) => (
            <ProductCard
              key={li.id}
              item={li}
              forecast={lineForecast(li.id)}
              rateCard={rateCard}
              onChange={(n) => setLineItem(li.id, n)}
              onRemove={() => removeLineItem(li.id)}
            />
          ))}

          <section className="card">
            <div className="section-title">
              <h2>{estimate.lineItems.length === 0 ? 'Add the first product' : 'Add another product'}</h2>
            </div>
            <div className="picker">
              {PRODUCTS.map((p) => (
                <button type="button" key={p} onClick={() => addLineItem(p)}>
                  <span className="t">
                    <i className="swatch" style={{ background: PRODUCT_COLOR_VAR[p] }} />
                    {PRODUCT_LABELS[p]}
                  </span>
                  <span className="d">{PRODUCT_BLURBS[p]}</span>
                </button>
              ))}
            </div>
          </section>
        </div>

        <div className="forecast-col">
          {'ok' in result ? (
            <ForecastView result={result.ok} estimate={estimate} />
          ) : (
            <section className="card">
              <div className="eyebrow">Forecast</div>
              <p className="error small" style={{ marginTop: 8 }}>
                Some inputs aren't valid yet: {result.err}
              </p>
            </section>
          )}
        </div>
      </div>
    </>
  );
}

/** Monthly subtotal shown in a product card's header. */
function subtotal(item: LineItem, f: LineItemForecast | undefined): string {
  if (!f) return '';
  const missing = f.warnings.some((w) => w.code === 'RATE_MISSING' || w.code === 'MODEL_UNKNOWN');
  if (missing) return 'needs input';
  const unit = item.product === 'githubCopilot' ? 'AI credits' : 'credits';
  return `${compact.format(f.baseUnits)} ${unit} / month`;
}

/**
 * One product line: coloured header (colour follows the product into the chart),
 * the product's form, and the full inputs as JSON under "Advanced", validated live
 * against the engine's LineItemSchema and kept in sync with the form.
 */
function ProductCard({
  item,
  forecast: f,
  rateCard,
  onChange,
  onRemove,
}: {
  item: LineItem;
  forecast: LineItemForecast | undefined;
  rateCard: RateCard;
  onChange: (n: LineItem) => void;
  onRemove: () => void;
}) {
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

  const sub = subtotal(item, f);
  return (
    <section className="product" aria-label={item.label}>
      <header className="product-head">
        <span className="accent-bar" style={{ background: PRODUCT_COLOR_VAR[item.product] }} />
        <div className="grow">
          <input className="label-input" aria-label="Line name" value={item.label} onChange={(e) => onChange({ ...item, label: e.target.value })} />
          {item.label !== PRODUCT_LABELS[item.product] && <div className="small muted" style={{ paddingLeft: 6 }}>{PRODUCT_LABELS[item.product]}</div>}
        </div>
        {sub && <span className={sub === 'needs input' ? 'pill warn' : 'product-sub'}>{sub}</span>}
        <button type="button" className="subtle danger" onClick={onRemove} aria-label={`Remove ${item.label}`}>
          Remove
        </button>
      </header>
      <div className="product-body">
        {item.product === 'cowork' && <CoworkFields item={item} onChange={onChange} />}
        {item.product === 'copilotStudio' && <CopilotStudioFields item={item} onChange={onChange} rateCard={rateCard} />}
        {item.product === 'powerPlatformAi' && <PowerPlatformAiFields item={item} onChange={onChange} />}
        {item.product === 'githubCopilot' && <GitHubCopilotFields item={item} onChange={onChange} rateCard={rateCard} />}
        <details>
          <summary>Advanced (JSON)</summary>
          <textarea spellCheck={false} rows={Math.min(24, text.split('\n').length + 1)} value={text} onChange={(e) => edit(e.target.value)} />
        </details>
        {error && <p className="error small">{error}</p>}
      </div>
    </section>
  );
}
