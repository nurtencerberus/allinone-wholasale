-- ODE-6: credit control for invoice (Net-30) orders (after 0011_company_accounts.sql).
-- Until now any approved trade account could order on terms without limit. Accounts get a
-- credit limit, payment terms and a hold flag, and invoice orders get a due date.
--
-- The limit defaults to 0, which means **no invoice credit**: after this migration a Net-30
-- order is refused until the trade desk sets a limit on the account. That is the safe default;
-- set the limits you intend to grant in Admin → Accounts → Prices before announcing terms.
-- Run before the deploy that reads it; safe to re-run.

BEGIN;

ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "credit_limit" integer DEFAULT 0 NOT NULL;
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "payment_terms_days" integer DEFAULT 30 NOT NULL;
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "credit_hold" boolean DEFAULT false NOT NULL;

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "credit_limit" integer DEFAULT 0 NOT NULL;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "payment_terms_days" integer DEFAULT 30 NOT NULL;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "credit_hold" boolean DEFAULT false NOT NULL;

ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "due_at" timestamp with time zone;

-- Invoices already on the books get the due date they should have had, so the aging report and
-- the overdue rule start from the truth rather than treating every old invoice as "not due".
UPDATE "orders"
   SET "due_at" = "created_at" + interval '30 days'
 WHERE "due_at" IS NULL AND "payment_status" = 'net30_invoice';

COMMIT;
