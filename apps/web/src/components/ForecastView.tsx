import type { EstimateForecast } from '@ai-credits/engine';

const fmtUnits = (n: number) => Math.round(n).toLocaleString();

export function ForecastView({ result }: { result: EstimateForecast }) {
  const { pools, totals, warnings } = result;
  const rec = pools.copilotCredits.recommended;
  const ccComplete = pools.copilotCredits.unitsComplete;
  const ghComplete = pools.githubAiCredits.unitsComplete;
  // Incomplete usage is a lower bound: show it as "≥ n" so it never reads as a real figure.
  const units = (n: number, complete: boolean) => (complete ? fmtUnits(n) : `≥ ${fmtUnits(n)}`);
  const incomplete = !ccComplete || !ghComplete;
  const money = (n: number | null) =>
    n === null
      ? incomplete
        ? 'incomplete'
        : 'unpriced'
      : n.toLocaleString(undefined, { style: 'currency', currency: totals.currency });

  return (
    <section className="card">
      <h2>Forecast</h2>
      <p className="muted">
        Rate card {result.rateCardVersion} · {result.horizonMonths} months · list prices only where the rate card is sourced
      </p>

      <div className="tiles">
        <div className="tile">
          <span className="label">Copilot Credits, peak month</span>
          <strong>{units(pools.copilotCredits.peakMonthUnits, ccComplete)}</strong>
          <span className="muted">
            {!ccComplete
              ? 'Usage incomplete: add the missing rates below'
              : rec
                ? `Recommended: ${rec.strategy}`
                : 'No priced purchase option yet'}
          </span>
        </div>
        <div className="tile">
          <span className="label">GitHub AI Credits included / month</span>
          <strong>{fmtUnits(pools.githubAiCredits.includedPerMonth)}</strong>
          <span className="muted">Overage month 1: {units(pools.githubAiCredits.overageUnitsByMonth[0] ?? 0, ghComplete)}</span>
        </div>
        <div className="tile">
          <span className="label">Total over horizon</span>
          <strong>{money(totals.horizon)}</strong>
        </div>
      </div>

      {warnings.length > 0 && (
        <ul className="warnings">
          {warnings.map((w, i) => (
            <li key={i}>
              <span title={w.code}>{w.message}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="scroll">
        <table>
          <thead>
            <tr>
              <th>Month</th>
              <th>Copilot Credits</th>
              <th>GitHub AI Credits</th>
              <th>GitHub overage</th>
              <th>Total ({totals.currency})</th>
            </tr>
          </thead>
          <tbody>
            {totals.byMonth.map((t, i) => (
              <tr key={i}>
                <td>{i + 1}</td>
                <td>{units(pools.copilotCredits.unitsByMonth[i] ?? 0, ccComplete)}</td>
                <td>{units(pools.githubAiCredits.unitsByMonth[i] ?? 0, ghComplete)}</td>
                <td>{units(pools.githubAiCredits.overageUnitsByMonth[i] ?? 0, ghComplete)}</td>
                <td>{money(t)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
