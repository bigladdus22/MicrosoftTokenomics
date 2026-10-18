import type { Estimate, EstimateForecast, ProductId, Warning } from '@ai-credits/engine';
import { PRODUCT_COLOR_VAR, PRODUCT_LABELS } from '../lib/defaults';
import { CreditsChart, type Series } from './CreditsChart';

const CC_PRODUCTS: ProductId[] = ['cowork', 'copilotStudio', 'powerPlatformAi'];
const int = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });
const compact = new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 });

const STRATEGY: Record<string, string> = {
  payg: 'Pay-as-you-go',
  packs: 'Capacity packs',
  'packs+payg': 'Capacity packs + PAYG overage',
  p3: 'Pre-purchase plan (P3)',
  'p3+payg': 'P3 + PAYG after term',
};

/** Short name for a rate-card gap (PRICE_MISSING / P3_TIERS_MISSING). */
function gapLabel(w: Warning): string {
  if (w.code === 'P3_TIERS_MISSING') return 'P3 pre-purchase tiers';
  if (w.message.startsWith('Capacity-pack')) return 'capacity-pack price';
  if (w.message.includes('PAYG')) return 'pay-as-you-go price';
  if (w.message.includes('seat price')) return 'GitHub seat prices';
  if (w.message.includes('GBP')) return 'GBP exchange rate';
  return w.message;
}

/** Warnings the user can act on in the inputs, as opposed to known rate-card gaps. */
function actionable(w: Warning): boolean {
  if (w.scope === 'pool' && w.code === 'RATE_MISSING') return false; // summary of line-item gaps
  return w.code === 'RATE_MISSING' || w.code === 'MODEL_UNKNOWN' || w.code === 'USAGE_BLOCKED' || w.code === 'INVALID_INPUT';
}

export function ForecastView({ result, estimate }: { result: EstimateForecast; estimate: Estimate }) {
  const { pools, totals, warnings, horizonMonths: H } = result;
  const cc = pools.copilotCredits;
  const gh = pools.githubAiCredits;
  const cur = totals.currency;
  const money = (n: number, digits = n >= 1000 ? 0 : 2) =>
    n.toLocaleString(undefined, { style: 'currency', currency: cur, maximumFractionDigits: digits, minimumFractionDigits: digits });
  const label = (id?: string) => estimate.lineItems.find((l) => l.id === id)?.label;

  const hasCc = result.lineItems.some((l) => l.meter === 'copilotCredits');
  const hasGh = result.lineItems.some((l) => l.meter === 'githubAiCredits');
  const incomplete = !cc.unitsComplete || !gh.unitsComplete;

  // Chart series: one per Copilot Credits product present, colour follows the product.
  const series: Series[] = CC_PRODUCTS.flatMap((p) => {
    const lines = result.lineItems.filter((l) => l.product === p);
    if (lines.length === 0) return [];
    const values = Array.from({ length: H }, (_, i) => lines.reduce((a, l) => a + (l.unitsByMonth[i] ?? 0), 0));
    return [{ id: p, label: PRODUCT_LABELS[p], color: PRODUCT_COLOR_VAR[p], values }];
  });

  // Needs attention (actionable) vs rate-card gaps (informational).
  const seen = new Set<string>();
  const todo = warnings.filter(actionable).filter((w) => {
    const k = `${w.code}|${w.ref}|${w.message}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  const coworkGaps = new Set(todo.filter((w) => w.code === 'RATE_MISSING' && estimate.lineItems.find((l) => l.id === w.ref)?.product === 'cowork').map((w) => w.ref));
  const attention = [
    ...[...coworkGaps].map((ref) => ({
      title: `${label(ref) ?? 'Cowork'}: enter credits per task`,
      detail: "Cowork has no published per-task average. Use the customer's /cost readings or the Cowork estimator.",
    })),
    ...todo
      .filter((w) => !(w.code === 'RATE_MISSING' && coworkGaps.has(w.ref)))
      .map((w) => ({
        title:
          w.code === 'USAGE_BLOCKED'
            ? 'GitHub Copilot would stop at the included credits'
            : w.code === 'MODEL_UNKNOWN'
              ? `${label(w.ref) ?? 'GitHub Copilot'}: model not in rate card`
              : w.code === 'INVALID_INPUT'
                ? 'Rate card mismatch'
                : `${label(w.ref) ?? 'A product'}: rate not yet sourced`,
        detail: w.message,
      })),
  ];
  const gaps = warnings.filter((w) => w.code === 'PRICE_MISSING' || w.code === 'P3_TIERS_MISSING');
  const packOpt = cc.options.find((o) => o.strategy.startsWith('packs'));
  const p3Opt = cc.options.find((o) => o.strategy.startsWith('p3'));
  const paygOpt = cc.options.find((o) => o.strategy === 'payg');

  // Headline cost from the parts that are priced, naming what is excluded. The engine's
  // totals go null if anything is unpriced (e.g. GitHub seat prices); for the meeting view
  // we show the priced part and say so, rather than hide every number.
  const fx = totals.fxRate ?? 1;
  const ccCost: (number | null)[] | null = !hasCc ? Array(H).fill(0) : cc.unitsComplete && cc.recommended ? cc.recommended.costByMonthUSD : null;
  const seatsMissing = hasGh && gh.seatCostByMonthUSD.some((x) => x === null);
  const ghCost: number[] | null = !hasGh ? Array(H).fill(0) : gh.unitsComplete ? gh.overageCostByMonthUSD.map((o, i) => o + (gh.seatCostByMonthUSD[i] ?? 0)) : null;
  const costByMonth: (number | null)[] = Array.from({ length: H }, (_, i) =>
    ccCost && ghCost && ccCost[i] != null ? ((ccCost[i] as number) + (ghCost[i] ?? 0)) * fx : null,
  );
  const horizonCost = costByMonth.every((x): x is number => x !== null) ? costByMonth.reduce((x, y) => x + y, 0) : null;
  const excluded = seatsMissing ? 'GitHub seat licences (price not in rate card)' : null;
  const pricedOptions = cc.options.filter((o) => o.totalUSD !== null).length;
  const first = costByMonth[0] ?? null;
  const lastCost = costByMonth[H - 1] ?? null;
  const ccFirst = cc.unitsByMonth[0] ?? 0;
  const ccLast = cc.unitsByMonth[H - 1] ?? 0;
  const ghUsed = gh.unitsByMonth[0] ?? 0;
  const ghShare = gh.includedPerMonth > 0 ? ghUsed / gh.includedPerMonth : ghUsed > 0 ? 2 : 0;

  if (!hasCc && !hasGh) {
    return (
      <section className="card forecast">
        <div className="eyebrow">Forecast</div>
        <p className="muted">Add a product to see the forecast.</p>
      </section>
    );
  }

  return (
    <section className="card forecast" aria-label="Forecast">
      <div className="row spread">
        <div>
          <div className="eyebrow">Forecast{estimate.customerName ? ` · ${estimate.customerName}` : ''}</div>
          <div className="small muted">
            {H} months · rate card {result.rateCardVersion} · Microsoft list prices
          </div>
        </div>
        {cc.recommended && cc.unitsComplete && (
          <span className="pill accent">
            {pricedOptions > 1 ? 'Best option' : 'Priced on'}: {STRATEGY[cc.recommended.strategy]}
          </span>
        )}
      </div>

      <div className="hero">
        <span className="small secondary">Total over {H} months</span>
        {horizonCost !== null ? (
          <span className="value">{money(horizonCost, 0)}</span>
        ) : (
          <span className="value na">{incomplete ? 'Needs inputs' : 'Not priced yet'}</span>
        )}
        {horizonCost !== null && (
          <span className="small muted">
            ≈ {money(horizonCost / H, 0)} per month on average{excluded ? ` · excludes ${excluded}` : ''}
          </span>
        )}
      </div>

      <div className="stats">
        {hasCc && (
          <div className="stat">
            <span className="label">Copilot Credits / month</span>
            <span className="value">
              {cc.unitsComplete ? '' : '≥ '}
              {compact.format(ccFirst)}
            </span>
            <span className="sub">{ccLast !== ccFirst ? `→ ${compact.format(ccLast)} by month ${H}` : 'flat across the term'}</span>
          </div>
        )}
        <div className="stat">
          <span className="label">Month 1 cost</span>
          <span className="value">{first !== null ? money(first) : '—'}</span>
          <span className="sub">{lastCost !== null && H > 1 ? `month ${H}: ${money(lastCost)}` : ' '}</span>
        </div>
        {hasGh && (
          <div className="stat">
            <span className="label">GitHub AI Credits, month 1</span>
            <span className="value">
              {compact.format(ghUsed)} <span className="small muted">of {compact.format(gh.includedPerMonth)} included</span>
            </span>
            <div className={`meter${ghShare > 1 ? ' over' : ''}`} role="img" aria-label={`${Math.round(ghShare * 100)}% of included credits`}>
              <span style={{ width: `${Math.min(100, ghShare * 100)}%` }} />
            </div>
          </div>
        )}
      </div>

      {attention.length > 0 && (
        <div className="attention">
          <div className="eyebrow">Needs attention</div>
          <ul>
            {attention.map((a, i) => (
              <li key={i}>
                <span className="icon" aria-hidden="true">
                  !
                </span>
                <span>
                  <strong>{a.title}</strong>
                  <span className="secondary">{a.detail}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {series.length > 0 && (
        <div>
          <div className="row spread" style={{ marginBottom: 8 }}>
            <h3>Copilot Credits per month</h3>
            {!cc.unitsComplete && <span className="pill warn">partial: some inputs missing</span>}
          </div>
          <CreditsChart series={series} title="Copilot Credits per month by product" />
        </div>
      )}

      {hasCc && (
        <div>
          <h3 style={{ marginBottom: 8 }}>How to buy the Copilot Credits</h3>
          {!cc.unitsComplete ? (
            <p className="small muted">Shown once every Copilot Credits product has its inputs.</p>
          ) : (
            <table className="options">
              <thead>
                <tr>
                  <th>Option</th>
                  <th className="num">Total</th>
                  <th className="num">vs pay-as-you-go</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { name: 'Pay-as-you-go', opt: paygOpt, missing: 'Price not in rate card' },
                  { name: packOpt ? STRATEGY[packOpt.strategy] + (packOpt.packs ? ` (${packOpt.packs} × 25K)` : '') : 'Capacity packs', opt: packOpt, missing: 'Pack price not in rate card yet' },
                  { name: 'Pre-purchase plan (P3)', opt: p3Opt, missing: 'P3 tiers not in rate card yet' },
                ].map(({ name, opt, missing }) => {
                  const best = pricedOptions > 1 && !!opt && opt === cc.recommended;
                  return (
                    <tr key={name} className={best ? 'best' : undefined}>
                      <td>
                        {name}
                        {best && <span className="pill accent" style={{ marginLeft: 8 }}>best</span>}
                      </td>
                      <td className="num">{opt?.totalUSD != null ? money(opt.totalUSD * (totals.fxRate ?? 1), 0) : <span className="muted">{missing}</span>}</td>
                      <td className="num">
                        {opt && opt.strategy !== 'payg' && opt.savingVsPaygUSD != null
                          ? `${opt.savingVsPaygUSD >= 0 ? 'saves' : 'costs'} ${money(Math.abs(opt.savingVsPaygUSD * (totals.fxRate ?? 1)), 0)}`
                          : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      <details>
        <summary>Monthly breakdown</summary>
        <div className="scroll">
          <table className="breakdown">
            <thead>
              <tr>
                <th>Month</th>
                {series.map((s) => (
                  <th key={s.id}>{s.label}</th>
                ))}
                {hasGh && <th>GitHub AI Credits</th>}
                {hasGh && <th>GitHub overage</th>}
                <th>Cost ({cur}){excluded ? '*' : ''}</th>
              </tr>
            </thead>
            <tbody>
              {costByMonth.map((_, i) => (
                <tr key={i}>
                  <td>{i + 1}</td>
                  {series.map((s) => (
                    <td key={s.id}>{int.format(s.values[i] ?? 0)}</td>
                  ))}
                  {hasGh && <td>{int.format(gh.unitsByMonth[i] ?? 0)}</td>}
                  {hasGh && <td>{int.format(gh.overageUnitsByMonth[i] ?? 0)}</td>}
                  <td>{costByMonth[i] == null ? '—' : money(costByMonth[i] as number)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>

      {gaps.length > 0 && (
        <p className="notes">
          Not yet in rate card {result.rateCardVersion}: {[...new Set(gaps.map(gapLabel))].join(' · ')}. Anything unpriced is left out,
          never counted as $0.
        </p>
      )}
    </section>
  );
}
