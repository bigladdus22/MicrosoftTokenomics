# Setup: Azure Static Web Apps + Supabase

How the calculator is hosted, and the one-off steps to go live. It is an **internal
tool with a single user** (email + password, no public sign-up). Facts about Azure carry a footnote to the Microsoft Learn page they were checked against on
2026-10-17. Anything marked **(unverified)** is a working assumption to confirm.

## Architecture

```
Browser ── Azure Static Web Apps (global edge, TLS, PR previews)
   │         serves apps/web/dist (React SPA + the engine, compiled in)
   │
   └── supabase-js ──► Supabase project uixmmjcuhnzwuqhawmwn (eu-west-2, London)
                        ├─ Auth: email + password, public sign-up off
                        ├─ Postgres + RLS: profiles · estimates · line_items
                        └─ RPC save_estimate (atomic upsert, runs under caller's RLS)
```

- **No server code on Azure.** The forecast engine runs in the browser, and Supabase
  is the only backend. SWA's managed Functions are not used, so the Free plan is enough.
- **The rate card ships in the bundle.** A price change is a reviewed PR that adds a new
  `rate-card.<version>.json`, never a database edit. Saved estimates store inputs only
  and are re-priced against their pinned version on load.
- **Data isolation is enforced in Postgres.** Every table has owner-only RLS. The anon
  role has no table grants. The publishable key in the bundle is public by design.

## 1. Supabase (done)

| Item | State |
| --- | --- |
| Project | `ai-credits-calculator`, ref `uixmmjcuhnzwuqhawmwn`, region eu-west-2, org Finance Team |
| Migrations applied | `calculator_profiles`, `calculator_estimates`, `calculator_policies`, `calculator_save_estimate` |
| Security advisor | No findings after the migrations |
| RLS check | Simulated two users in a rolled-back transaction: B sees none of A's rows |

New migrations go in `supabase/migrations/`. On merge to `main`, Supabase's GitHub
integration (Project Settings → Integrations → GitHub) applies them to the project; no
database password or access token is stored in GitHub. Keep the integration's production
deploys enabled. To apply by hand instead: `supabase link --project-ref uixmmjcuhnzwuqhawmwn && supabase db push`.

Dashboard settings to change before launch:

- **Auth → URL Configuration**: set Site URL to the SWA hostname (or custom domain).
  Add `https://<swa-host>/**` and `https://*.<region>.azurestaticapps.net/**` (PR previews)
  to the redirect allow-list. The exact preview hostname pattern is **(unverified)**:
  copy it from the first preview deployment.
- **Auth → Sign In / Providers**: turn **off** "Allow new users to sign up" (see §3).

## 2. Azure Static Web Apps

**Plan.** Start on **Free**. It includes global distribution, free auto-renewing TLS, GitHub
integration, 2 custom domains and 3 staging (PR preview) environments, but no SLA.[^plans]
Move to **Standard** when you need an SLA, more than 3 preview environments, private
endpoints, or formal support.[^plans] You can upgrade or downgrade in the portal at any time.[^faq]
Check current Standard pricing in the Azure Pricing Calculator / [SWA pricing page](https://azure.microsoft.com/pricing/details/app-service/static/). This guide does not quote a price.

**Create the resource.** Either:

- Portal: Create → Static Web App → plan Free → Deployment source **Other** (the repo
  workflow deploys with a token). Or
- Bicep: `az deployment group create -g <rg> -f infra/main.bicep`[^bicep]

**Wire up GitHub.** Settings → Secrets and variables → Actions:

| Kind | Name | Value |
| --- | --- | --- |
| Secret | `AZURE_STATIC_WEB_APPS_API_TOKEN_PURPLE_TREE_03DE28A10` | created automatically when the SWA was linked to GitHub (or set `AZURE_STATIC_WEB_APPS_API_TOKEN` manually) |
| Variable | `VITE_SUPABASE_URL` | `https://uixmmjcuhnzwuqhawmwn.supabase.co` |
| Variable | `VITE_SUPABASE_PUBLISHABLE_KEY` | the `sb_publishable_…` key (Supabase → Project Settings → API Keys) |

`.github/workflows/azure-static-web-apps.yml` builds the monorepo in Actions, then uploads
`apps/web/dist` with `skip_app_build: true` and `output_location: ''`, as Learn documents for
prebuilt apps.[^build] `staticwebapp.config.json` is copied into `dist/` by Vite, as that mode
requires.[^build] Until the token secret exists, the deploy step is skipped rather than failing
(`SKIP_DEPLOY_ON_MISSING_SECRETS`).[^build]

**`staticwebapp.config.json`** (in `apps/web/public/`) sets:

- `navigationFallback` → `/index.html`, so deep links work in the SPA.[^config]
- `globalHeaders`: CSP (only `self` plus `*.supabase.co`), nosniff, referrer policy.[^config]
- Long-cache hashed `/assets/*`, `no-cache` on `index.html`.

## 3. Sign-in (single user)

- The app has an email + password sign-in screen only: no sign-up form, no social or Microsoft login.
- **Turn off public sign-up** in the hosted project: Supabase → **Authentication → Sign In / Providers**
  → "Allow new users to sign up" off. The app has no sign-up form, but the Auth API would still
  accept a sign-up call until this is off. `supabase/config.toml` sets the same for local development.
- **Add or remove users** in Supabase → **Authentication → Users** (Add user → create with
  password, tick "Auto confirm"). Only users listed there can sign in.
- **Forgotten password:** reset it from the same Users page (… → Send password recovery, or
  delete and re-create the user). The app has no self-service reset screen.
- Every estimate is private to the user who created it (row-level security); a second user
  would see none of yours.

## 4. Local development

```bash
npm install
cp apps/web/.env.example apps/web/.env.local
npm run dev                 # http://localhost:5173 against the hosted Supabase project
npm run ci                  # rate card, typecheck, tests, web build
```

For a fully local backend, run `supabase start` and point `.env.local` at `http://localhost:54321`.

## Open items

| # | Item | Owner |
| --- | --- | --- |
| 1 | ~~Apply `save_estimate`~~ done | — |
| 2 | ~~Create the SWA resource and deploy~~ done | — |
| 3 | Turn off public sign-up in the Supabase dashboard (§3) | You |
| 4 | Site URL / redirect allow-list in Supabase (only matters for password-recovery emails) | You |
| 5 | Fill the 5 unpriced rate-card fields from the licensing guide (`npm run validate:rate-card` lists them) | Commercial owner |
| 6 | ~~Per-product forms~~ done; add Excel export (SheetJS) | Next build step |
| 7 | Record of processing for customer names you store (internal use; no customer accounts) | You |

[^plans]: Azure Static Web Apps hosting plans — https://learn.microsoft.com/azure/static-web-apps/plans
[^faq]: Azure Static Web Apps FAQ (changing plans) — https://learn.microsoft.com/azure/static-web-apps/faq
[^bicep]: Deploy Azure Static Web Apps with Bicep — https://learn.microsoft.com/azure/static-web-apps/publish-bicep ; resource reference https://learn.microsoft.com/azure/templates/microsoft.web/2023-01-01/staticsites
[^build]: Build configuration for Azure Static Web Apps (skip_app_build, SKIP_DEPLOY_ON_MISSING_SECRETS) — https://learn.microsoft.com/azure/static-web-apps/build-configuration
[^config]: Configure Azure Static Web Apps (navigationFallback, globalHeaders) — https://learn.microsoft.com/azure/static-web-apps/configuration
