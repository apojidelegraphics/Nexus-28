# aARgon3

The Apoji systems store for Nexus '28, and the staff terminal that sells it.

- **Store** (public, GitHub Pages): https://apojidelegraphics.github.io/aArgon3/ — plans, compare page, company details, promo codes, Stripe checkout, order number.
- **Terminal** (staff only): https://apojidelegraphics.github.io/aArgon3/terminal/ and the **aARgon3** desktop app for Mac and Windows
  ([Releases](https://github.com/apojidelegraphics/aArgon3/releases/latest)). Sign in with your Nexus account.

## What's where

| Path | What |
|---|---|
| `index.html`, `compare.html`, `success.html`, `terms/` | The store, everything-in-every-plan, the thank-you page (order number), Terms of Sale |
| `terminal/` | The staff terminal: clock, sales, orders, catalog, schedule, timesheets, sales reports, profile, custom orders, promotions, team, activity, settings |
| `electron/`, `build/` | The desktop app (loads `terminal/` from inside the app) and its icon, DMG background and Windows installer art |
| `catalog.json` | **Prices, tiers, models, chips, LentOS, connections and the customer fields per plan.** Edit, then `npm run catalog` |
| `supabase/aargon3-2.0.sql`, `aargon3-2.1.sql` | Database: lockdown, orders, stores, clock (2.0); staff roles, schedule, time off, quotes, payments, promotions, settings (2.1) |
| `supabase/functions/` | Edge Functions: `checkout` (store), `stripe-webhook` (Stripe), `staff` (terminal and Apoji Admin) |
| `supabase/wipe.sql` | Clears all sales data at launch (no undo) |

## Who can do what

Staff sign in with their Nexus account. The `staff` function checks every request:

| Role | Who | Can |
|---|---|---|
| Employee | Nexus admins (not high-admin), or anyone a manager adds by email | Clock in/out and breaks, sell, look up orders, see the catalog and the schedule, their own timesheet and sales, ask for time off, edit their profile |
| Manager | Nexus high-admins, or anyone the owner makes a manager | All of that, plus: everyone's timesheets and sales, fixing shifts, scheduling, time-off answers, custom orders and Enterprise quotes, invoices, comps, cancels and refunds, promo codes, adding employees, the activity log |
| Owner | apojidelegraphics101010@gmail.com (set in `supabase/functions/staff/handler.mjs`) | Everything, plus: give points to managers, the late-clock-in points setting, never has to clock in (can still clock in and be scheduled), roles, pay rates (and pay estimates on timesheets), switching people off, store open/closed, business details, sales goal, stores |

The repo is public, so nothing secret lives here: the pages only hold public keys, prices are worked out again on the server, and orders are only written once Stripe says they're paid.

## Setup / updating

1. **Database**: Supabase → aARgon3 & Mexel Backend → SQL Editor → run `supabase/aargon3-2.0.sql` (once), then `supabase/aargon3-2.1.sql`, then `supabase/aargon3-2.3.sql` (points and website custom-order requests).
2. **Functions**: from this folder, `npx supabase functions deploy checkout stripe-webhook staff --project-ref yuergfrpfhtcxjkcgjrx --no-verify-jwt --use-api`.
3. **Secrets** (Supabase → Edge Functions → Secrets): `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `SITE_URL` = `https://apojidelegraphics.github.io/aArgon3`.
4. **Stripe webhook** → `https://yuergfrpfhtcxjkcgjrx.supabase.co/functions/v1/stripe-webhook`, Snapshot payloads, events:
   `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`.
5. **Pages**: GitHub → Settings → Pages → Deploy from a branch → `main` / root.
6. **Desktop app**: push a tag like `v2.3.0` and GitHub Actions builds the Mac and Windows apps into a Release. Windows copies (2.3+) update themselves from that Release (`latest.yml`); Mac shows a download note.
7. Optional: Stripe → Settings → Billing → Customer portal → copy the login link into `assets/config.js` (`portalUrl`).

Test with card `4242 4242 4242 4242`, any future date, any CVC. In the sandbox Stripe only emails invoices to your own team's addresses.

## Develop

```
npm install
npm start          # the desktop app
npm run site       # the website at http://localhost:8028
npm test           # A3_PG="-h /tmp -p 5432 -U postgres" npm test also runs the SQL against a scratch Postgres
```

Releasing the desktop app: push a tag like `v2.1.0`. GitHub Actions builds the Mac DMGs and the Windows installer and publishes a release.

© 2026 Apoji Delegraphics. All rights reserved.
