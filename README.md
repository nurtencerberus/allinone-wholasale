# Meridian Supply Co. — B2B wholesale storefront

A US-market B2B wholesale store for vitamins & supplements, pantry staples and home goods.
Built with **Next.js 16 (App Router)**, **PostgreSQL + Drizzle ORM** and **Tailwind CSS 4**.

> **Status: demo / MVP.** It is not ready to take real customer payments. Read
> [`B2B_ROADMAP.md`](./B2B_ROADMAP.md) first — it lists the security, tax and compliance work
> required before going live.

## What is in it

- **Storefront:** filterable catalog, product pages with JSON-LD, sliding cart (localStorage), 3-step checkout.
- **Quick order:** every SKU in one table, plus XLS / CSV order-sheet download and upload.
- **B2B:** wholesale applications, EIN review, per-account discount and resale tax exemption,
  Net-30 PO and ACH/wire payment options.
- **Freight & tax:** dimensional-weight freight (parcel and LTL) and destination sales tax —
  built-in estimates, with optional EasyPost and TaxJar.
- **Payments:** Stripe Elements when keys are set; otherwise a test-card simulation.
- **Accounts:** scrypt passwords, httpOnly sessions, e-mail verification, password reset.
- **Admin (`/admin`):** applications, orders and tracking, users, products (with photo upload),
  catalog import/export, supplier price lists (.xlsx / .csv).
- **SEO:** dynamic `sitemap.xml`, `robots.txt`, structured data.

## Run it locally

Requires Node 20+ and a PostgreSQL database.

```bash
npm install
cp .env.example .env          # then edit DATABASE_URL
npx drizzle-kit push --url "$DATABASE_URL"   # create the tables (drizzle.config.json does not read .env)
npm run dev                   # http://localhost:3000
```

The catalog, reviews, coupons and demo data are seeded automatically on the first request.

### Demo logins (only when `SEED_DEMO_DATA` is not `false`)

| Role | E-mail | Password |
|---|---|---|
| Admin | `admin@meridiansupply.co` | `Admin123!` |
| Wholesale buyer | `buyer@harborhouse.com` | `Trade123!` |
| Retail customer | `customer@example.com` | `Customer123!` |

These credentials are in the source. **Keep this repository private**, and set
`SEED_DEMO_DATA=false` on any deployment that is reachable from the internet.

## Environment variables

See [`.env.example`](./.env.example). Only `DATABASE_URL` is required. Every integration
(Stripe, TaxJar, EasyPost, Resend) falls back to a built-in simulation when its key is blank.
`NEXT_PUBLIC_*` values are baked in at **build** time.

## Useful commands

```bash
npm run build                      # production build (needs DATABASE_URL)
npm run start                      # serve the production build
npm exec tsc -- --noEmit           # type check
npx drizzle-kit push --url "$DATABASE_URL"   # apply schema changes
```

## Project layout

```
src/app/            pages and API routes (App Router)
src/components/     UI (checkout, admin, cart, account…)
src/db/schema.ts    Drizzle tables
src/lib/            pricing, freight, tax, auth, e-mail, spreadsheets
public/images/      product and category photos
```

## Documentation

- [`DEPLOYMENT.md`](./DEPLOYMENT.md) — going live (Vercel or a VPS), environment, checklist.
- [`B2B_ROADMAP.md`](./B2B_ROADMAP.md) — review findings and phased work plan.
- [`MIGRATION.md`](./MIGRATION.md) — moving content and catalog data from another project.
