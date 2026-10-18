/**
 * Monthly Copilot Credits, stacked by product (one meter, so one unit and one axis).
 * Columns <= 24px with a 4px rounded top and a 2px surface gap between segments;
 * each column is its own hover/focus target with one tooltip listing every series.
 * Identity: legend + direct labels on the last column (<= 3 series) + the table view.
 */
import { useEffect, useRef, useState } from 'react';

export interface Series {
  id: string;
  label: string;
  color: string;
  values: number[];
}

const H = 240;
const PAD = { top: 12, right: 112, bottom: 26, left: 44 };
const GAP = 2;
const RADIUS = 4;

const compact = new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 });
const full = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });

function niceMax(v: number): number {
  if (v <= 0) return 1;
  const exp = Math.pow(10, Math.floor(Math.log10(v)));
  const f = v / exp;
  const step = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return step * exp;
}

/** Path for a bar with a rounded top only (square at the baseline side). */
function topRounded(x: number, y: number, w: number, h: number, r: number): string {
  const rr = Math.min(r, w / 2, h);
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`;
}

export function CreditsChart({ series, title }: { series: Series[]; title: string }) {
  const [hover, setHover] = useState<number | null>(null);
  // Draw at the real pixel width so text stays 11px however wide the panel is
  // (a scaled viewBox would blow labels up in Present mode and shrink them on phones).
  const ref = useRef<HTMLElement>(null);
  const [W, setW] = useState(640);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, Math.round(e!.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const narrow = W < 480;
  const padRight = narrow ? 16 : PAD.right;
  const months = series[0]?.values.length ?? 0;
  const totals = Array.from({ length: months }, (_, i) => series.reduce((a, s) => a + (s.values[i] ?? 0), 0));
  const max = niceMax(Math.max(0, ...totals));
  const plotW = W - PAD.left - padRight;
  const plotH = H - PAD.top - PAD.bottom;
  const band = plotW / Math.max(1, months);
  const barW = Math.min(24, Math.max(4, band * 0.62));
  const y = (v: number) => PAD.top + plotH - (v / max) * plotH;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * max);
  const labelEvery = Math.max(1, Math.ceil(months / Math.max(4, Math.floor(plotW / 36))));

  // Stack bottom-up, leaving a 2px gap between segments.
  const columns = totals.map((_, i) => {
    let base = PAD.top + plotH;
    const segs: { id: string; color: string; y: number; h: number }[] = [];
    series.forEach((s) => {
      const v = s.values[i] ?? 0;
      if (v <= 0) return;
      const h = (v / max) * plotH;
      const gap = segs.length > 0 && h > GAP + 1 ? GAP : 0;
      segs.push({ id: s.id, color: s.color, y: base - h + gap, h: Math.max(0, h - gap) });
      base -= h;
    });
    return { x: PAD.left + band * i + (band - barW) / 2, segs };
  });

  // Direct labels on the last column, only where the segment is tall enough.
  const last = columns[months - 1];
  const directLabels =
    series.length <= 3 && last && !narrow
      ? last.segs
          .filter((s) => s.h >= 14)
          .map((s) => ({ ...s, label: series.find((x) => x.id === s.id)!.label }))
      : [];

  const tip = hover === null ? null : { i: hover, left: ((columns[hover]!.x + barW / 2) / W) * 100 };

  return (
    <figure ref={ref} className="chart" style={{ margin: 0 }} aria-label={title}>
      {series.length > 1 && (
        <div className="legend" aria-hidden="true">
          {series.map((s) => (
            <span key={s.id}>
              <i className="swatch" style={{ background: s.color }} />
              {s.label}
            </span>
          ))}
        </div>
      )}
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label={title} onPointerLeave={() => setHover(null)}>
        {ticks.map((t) => (
          <g key={t}>
            <line className={t === 0 ? 'baseline' : 'gridline'} x1={PAD.left} x2={W - padRight} y1={y(t)} y2={y(t)} />
            <text className="tick" x={PAD.left - 8} y={y(t)} dy="0.32em" textAnchor="end">
              {compact.format(t)}
            </text>
          </g>
        ))}
        {columns.map((c, i) => (
          <g
            key={i}
            className="col"
            tabIndex={0}
            onPointerEnter={() => setHover(i)}
            onFocus={() => setHover(i)}
            onBlur={() => setHover(null)}
            aria-label={`Month ${i + 1}: ${full.format(totals[i] ?? 0)} credits`}
          >
            <rect className="hit" x={PAD.left + band * i} y={PAD.top} width={band} height={plotH} fill="transparent" rx={4} />
            {c.segs.map((s, j) =>
              j === c.segs.length - 1 ? (
                <path key={s.id} className="seg" d={topRounded(c.x, s.y, barW, s.h, RADIUS)} fill={s.color} />
              ) : (
                <rect key={s.id} className="seg" x={c.x} y={s.y} width={barW} height={s.h} fill={s.color} />
              ),
            )}
            {(i % labelEvery === 0 || i === months - 1) && (
              <text className="tick" x={c.x + barW / 2} y={H - 8} textAnchor="middle">
                {i + 1}
              </text>
            )}
          </g>
        ))}
        {directLabels.map((d) => (
          <text key={d.id} className="tick" x={last!.x + barW + 8} y={d.y + d.h / 2} dy="0.32em" style={{ fill: 'var(--text-secondary)' }}>
            {d.label}
          </text>
        ))}
        {!narrow && (
          <text className="tick" x={W - padRight} y={H - 8} textAnchor="start" dx={8}>
            month
          </text>
        )}
      </svg>
      {tip && (
        <div className="tooltip" style={{ left: `${tip.left}%`, top: 24, transform: tip.left > 60 ? 'translateX(-105%)' : 'translateX(12px)' }}>
          <div className="tt-title">Month {tip.i + 1}</div>
          {[...series].reverse().map((s) => (
            <div className="tt-row" key={s.id}>
              <i className="key" style={{ background: s.color }} />
              <span className="secondary">{s.label}</span>
              <strong>{full.format(s.values[tip.i] ?? 0)}</strong>
            </div>
          ))}
          {series.length > 1 && (
            <div className="tt-row" style={{ borderTop: '1px solid var(--border)', marginTop: 4, paddingTop: 4 }}>
              <span className="secondary">Total</span>
              <strong>{full.format(totals[tip.i] ?? 0)}</strong>
            </div>
          )}
        </div>
      )}
    </figure>
  );
}
