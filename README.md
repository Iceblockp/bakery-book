# Bakery Book

A mobile-first bakery operations app built with one Next.js project for both the frontend and API.

## Current app

- Responsive mobile dashboard and desktop sidebar
- Interactive point-of-sale cart
- Owner email/password sign-in with Supabase Auth
- Versioned recipe blueprints with standard ingredient usage and expected yield
- Baking-batch form prefilled from its recipe, with actual usage, good output, and waste
- Raw-material and finished-goods stock views
- Catalog and raw-material purchase forms
- Opening-stock counts, physical-count adjustments, and an auditable correction history
- Safe transaction reversals that preserve original records
- Purchase total, optional supplier name, and automatic base-unit cost
- General expense tracking by category
- Gross-profit and cash-flow reports for today, 7 days, and 30 days
- Live daily sales, production, waste, and stock totals
- Installable PWA metadata
- Authenticated API routes backed by Supabase

## Supabase setup

1. Create or open a Supabase project.
2. Open the SQL editor and run `supabase/migrations/0001_initial_schema.sql`.
3. Run `supabase/migrations/0002_financial_accounts.sql`.
4. Run `supabase/migrations/0003_test_data_reset.sql`.
5. Run `supabase/migrations/0004_operational_workflow.sql`.
6. Copy `.env.example` to `.env.local`.
7. Add the project URL and publishable key from Supabase's Connect dialog.
8. Create the owner's login in Supabase Authentication.

After those steps, run the app and sign in with that owner account. New catalog items, purchases, baking batches, and sales are stored in Supabase immediately.

Never put a Supabase secret key in a `NEXT_PUBLIC_` environment variable. This app uses the publishable key plus each user's access token, and PostgreSQL Row Level Security keeps every owner's records separate.

## API

Authenticated requests use `Authorization: Bearer <access-token>`.

- `GET/POST/PATCH /api/catalog` — ingredients, products, and catalog maintenance
- `POST /api/recipes` — create a versioned recipe blueprint
- `GET /api/stock` — raw-material and finished-goods balances
- `POST /api/adjustments` — save an opening balance or physical stock count
- `GET/POST /api/history` — audit history and safe transaction reversals
- `POST /api/purchases` — atomic purchase and raw-stock increase
- `GET/POST /api/expenses` — operating-expense records
- `GET /api/reports?period=today|week|month` — gross profit, cash flow, and recent financial activity
- `POST /api/batches` — atomic ingredient consumption and finished output
- `POST /api/sales` — atomic sale and finished-stock deduction

Purchases, batches, and sales call PostgreSQL functions. Each operation is one database transaction and rejects insufficient stock.

## Temporary test-data reset

The reset control is hidden and blocked by default. To use it during development, set both variables below and restart/rebuild the app:

```bash
NEXT_PUBLIC_ENABLE_DATA_RESET=true
ENABLE_DATA_RESET=true
```

The owner must verify the current password, type the exact confirmation phrase, and acknowledge the irreversible action. The server accepts only a freshly issued session and the database reset is owner-scoped, atomic, and audited. Remove both variables—or set them to `false`—before production use.

## Run locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Verify

```bash
npm run build
```
# bakery-book
