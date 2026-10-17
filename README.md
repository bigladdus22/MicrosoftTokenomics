# AI Credits Forecast Calculator

Customer self-service forecast for Microsoft Copilot Credits (Cowork, Copilot Studio, Power Platform AI) and GitHub AI Credits (GitHub Copilot). Design spec: see the "AI Credits Forecast Calculator — Design Spec" doc.

## Layout

Hosted on **Azure Static Web Apps** with **Supabase** (Auth + Postgres/RLS) as the backend. Setup and go-live steps: [docs/SETUP.md](docs/SETUP.md).

```
├── packages/engine/              @ai-credits/engine: pure TypeScript, no React, no backend
│   ├── src/types.ts              Contracts: RateCard, Estimate, LineItem, *Forecast, Warning
│   ├── src/schemas.ts            zod schemas (rate card, estimate, export file)
│   ├── src/rate-card/            rate-card.<YYYY.MM>.json: versioned, immutable, sourced
│   ├── src/products/             one calculator per product → month-1 units
│   ├── src/purchaseMix.ts        packs vs P3 vs PAYG solver for the Copilot Credits pool
│   ├── src/forecast.ts           forecast(estimate, rateCard) → EstimateForecast
│   └── test/engine.test.ts       18 tests pinning the modelling rules
├── apps/web/                     Vite + React SPA (auth, estimate list, builder, forecast)
│   └── public/staticwebapp.config.json   SPA fallback + security headers for SWA
├── supabase/
│   ├── config.toml               local CLI config; email + Azure (Entra ID) providers
│   └── migrations/               profiles, estimates, line_items, owner-only RLS, save_estimate RPC
├── infra/main.bicep              Azure Static Web App resource (Free by default)
├── scripts/validate-rate-card.ts CI gate: schema + version/filename match + lists unpriced fields
└── .github/workflows/
    ├── ci.yml                    validate → typecheck → test → build web
    └── azure-static-web-apps.yml build in Actions, deploy dist/ to SWA, PR previews
```

## Run

```bash
npm install
cp apps/web/.env.example apps/web/.env.local
npm run dev         # web app on http://localhost:5173
npm run ci          # validate rate card, typecheck, test, build web
```

## The engine contract

```ts
import { forecast, RATE_CARDS, type Estimate } from '@ai-credits/engine';

const result = forecast(estimate, RATE_CARDS[0]);
result.pools.copilotCredits.recommended   // cheapest priced purchase option, or null
result.pools.githubAiCredits.overageUnitsByMonth
result.totals.byMonth                     // null in any month something is unpriced
result.warnings                           // PRICE_MISSING | RATE_MISSING | USAGE_BLOCKED | MODEL_UNKNOWN | P3_TIERS_MISSING ...
```

Rules the engine enforces (each has a test):

- Two meters, not four. Cowork, Copilot Studio and Power Platform AI pool into one Copilot Credits meter; GitHub Copilot is a separate GitHub AI Credits meter.
- Units are always computed. Cost is computed only where the rate card carries a price; a `null` price gives `cost: null` and a `PRICE_MISSING` warning, never a silent zero.
- Credits expire monthly on both meters. Growth compounds per month; nothing carries over.
- Copilot Studio sessions from Microsoft 365 Copilot-licensed users bill zero credits.
- GitHub included credits pool at the billing entity; overage is on the pool at $0.01/credit; `additionalUsageAllowed: false` zeroes overage cost and raises `USAGE_BLOCKED`.
- An estimate is pinned to a rate-card version; pricing it with a different version warns.

## Rate card rules

- One file per version in `packages/engine/src/rate-card/`, filename = version. Never edit a published version; add a new one.
- Every meter carries `source` (Learn or docs.github.com URL) and `verified` (ISO date).
- `null` means "not yet sourced". `npm run validate:rate-card` prints every null so the gaps stay visible.
- Currency prices are never hard-coded from memory. Microsoft list prices come from the licensing guide / Pricing Calculator and the app labels them "list price".

### Rate-card versions

| Version | Change | Source |
| --- | --- | --- |
| `2026.10` | Initial card: consumption rates only, no prices | — |
| `2026.10.1` | `copilotCredits.paygPricePerCredit.USD` = 0.01 (list) | [Learn: pay-as-you-go meters](https://learn.microsoft.com/power-platform/admin/pay-as-you-go-meters#how-do-meters-work) |

### Still unpriced in 2026.10.1 (as of 2026-10-17)

| Field | Where it comes from |
| --- | --- |
| `copilotCredits.capacityPack.priceUSD` | Copilot Credits licensing guide / Partner Center price list / Pricing Calculator. Not published on Learn. |
| `copilotCredits.prePurchaseP3.tiers` | Azure portal → Reservations → Copilot Credit Pre-Purchase Plan. Learn shows the tiers only as a screenshot. |
| `copilotCredits.consumptionRates.cowork.taskProfiles[*].avgCredits` | No fixed figure exists: Learn says per-task credits vary by model, context, runtime and tools. Use `creditsPerTaskOverride` from the customer's `/cost` readings or the Cowork estimator (aka.ms/CustomerCoworkEstimator). |
| `copilotCredits.consumptionRates.powerPlatformAi.*` | Learn: ai-builder/message-management |
| `githubAiCredits.plans.*.seatUSD` | github.com/pricing |

## Persistence model (Supabase)

Only engine **inputs** are stored. `estimates.assumptions` and `line_items.inputs` are jsonb columns, validated by the engine's zod schemas on save and on load. Outputs are recomputed from inputs plus the pinned rate card, so a newly published rate never alters a saved forecast. `save_estimate(jsonb)` upserts an estimate and replaces its line items in one transaction, under the caller's RLS. Every table is owner-only, and the anon role has no grants.

## Next steps

1. Go-live checklist: see "Open items" in [docs/SETUP.md](docs/SETUP.md).
2. Replace the draft JSON line-item editor with per-product forms.
3. Export: `ExportFileSchema` in the engine is the JSON contract (JSON export is live); add Excel via SheetJS client-side.
4. Fill the unpriced rate-card fields in a new rate-card version.
