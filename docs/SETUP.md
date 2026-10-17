# Setup: Azure Static Web Apps + Supabase

How the calculator is hosted, and the one-off steps to go live. Facts about Azure and
Entra carry a footnote to the Microsoft Learn page they were checked against on
2026-10-17. Anything marked **(unverified)** is a working assumption to confirm.

## Architecture

```
Browser ── Azure Static Web Apps (global edge, TLS, PR previews)
   │         serves apps/web/dist (React SPA + the engine, compiled in)
   │
   └── supabase-js ──► Supabase project uixmmjcuhnzwuqhawmwn (eu-west-2, London)
                        ├─ Auth: email+password  ·  Azure (Entra ID) OAuth
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

New migrations go in `supabase/migrations/`. On merge to `main` they are applied by the
**Deploy Supabase** workflow (`supabase db push`, secrets `SUPABASE_ACCESS_TOKEN` and
`SUPABASE_DB_PASSWORD`) and, where it is enabled, by Supabase's GitHub integration
(Project Settings → Integrations). `db push` skips versions already applied, so both can run.

Dashboard settings to change before launch:

- **Auth → URL Configuration**: set Site URL to the SWA hostname (or custom domain).
  Add `https://<swa-host>/**` and `https://*.<region>.azurestaticapps.net/**` (PR previews)
  to the redirect allow-list. The exact preview hostname pattern is **(unverified)**:
  copy it from the first preview deployment.
- **Auth → SMTP**: configure a custom SMTP sender. Email confirmation is on, and the
  built-in mailer is rate-limited.
- **Auth → Providers → Azure**: see §3.

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

## 3. Sign in with Microsoft (Entra ID → Supabase)

1. Entra admin center → **App registrations → New registration**.[^register]
   - Supported account types: **Multiple Entra ID tenants**, so customers' work accounts can sign in.[^register]
   - Redirect URI (platform **Web**): `https://uixmmjcuhnzwuqhawmwn.supabase.co/auth/v1/callback`.
     Supabase, not the SPA, is the OAuth client.
2. **Certificates & secrets → New client secret.** Copy the *Value* and diary its expiry.
3. Supabase → **Auth → Providers → Azure**: enable it, then paste the client ID and secret.
   Set the Azure Tenant URL to `https://login.microsoftonline.com/organizations/v2.0`
   (work/school accounts only). Use a tenant-specific URL to lock it to one org.
4. Recommended by Supabase: add the optional `xms_edov` claim (plus `email`) to the app
   manifest's `optionalClaims`, so Supabase can tell verified from unverified email
   domains and refuse account takeover via an unverified domain.

Supabase links an Entra login to an existing email+password account with the same verified
email **(unverified: check Auth → identity linking settings)**.

## 4. Local development

```bash
npm install
cp apps/web/.env.example apps/web/.env.local
npm run dev                 # http://localhost:5173 against the hosted Supabase project
npm run ci                  # rate card, typecheck, tests, web build
```

For a fully local backend, run `supabase start` and point `.env.local` at `http://localhost:54321`.
`supabase/config.toml` already sets `external_url` to `localhost` because Entra rejects `127.0.0.1` redirects.

## Open items

| # | Item | Owner |
| --- | --- | --- |
| 1 | ~~Apply `save_estimate`~~ done | — |
| 2 | ~~Create the SWA resource and deploy~~ done | — |
| 3 | Entra app registration and Supabase Azure provider (§3) | You (needs Entra admin rights) |
| 4 | Custom SMTP and the Site URL / redirect allow-list in Supabase | You |
| 5 | Fill the 5 unpriced rate-card fields from the licensing guide (`npm run validate:rate-card` lists them) | Commercial owner |
| 6 | Replace the JSON line-item editor with per-product forms; add Excel export (SheetJS) | Next build step |
| 7 | Decide the privacy notice / UK GDPR position for storing customer contact data | You / legal |

[^plans]: Azure Static Web Apps hosting plans — https://learn.microsoft.com/azure/static-web-apps/plans
[^faq]: Azure Static Web Apps FAQ (changing plans) — https://learn.microsoft.com/azure/static-web-apps/faq
[^bicep]: Deploy Azure Static Web Apps with Bicep — https://learn.microsoft.com/azure/static-web-apps/publish-bicep ; resource reference https://learn.microsoft.com/azure/templates/microsoft.web/2023-01-01/staticsites
[^build]: Build configuration for Azure Static Web Apps (skip_app_build, SKIP_DEPLOY_ON_MISSING_SECRETS) — https://learn.microsoft.com/azure/static-web-apps/build-configuration
[^config]: Configure Azure Static Web Apps (navigationFallback, globalHeaders) — https://learn.microsoft.com/azure/static-web-apps/configuration
[^register]: Register an application in Microsoft Entra ID — https://learn.microsoft.com/entra/identity-platform/quickstart-register-app
