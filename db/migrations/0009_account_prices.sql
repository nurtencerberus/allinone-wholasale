-- UX-7: negotiated prices per trade account (after 0008_server_cart.sql).
-- An agreed price replaces the catalogue and tier price for that buyer, and the account's
-- percentage discount is not applied on top of it — priceCart() enforces that rule.
-- Run before the deploy that reads it; safe to re-run.

BEGIN;

CREATE TABLE IF NOT EXISTS "account_prices" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"product_id" integer NOT NULL,
	"case_price" integer NOT NULL,
	"min_cases" integer,
	"starts_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"note" text,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$ BEGIN
  ALTER TABLE "account_prices" ADD CONSTRAINT "account_prices_user_id_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "account_prices" ADD CONSTRAINT "account_prices_product_id_products_id_fk"
    FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "account_prices" ADD CONSTRAINT "account_prices_created_by_users_id_fk"
    FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "account_prices_account_product_unique" ON "account_prices" ("user_id", "product_id");
CREATE INDEX IF NOT EXISTS "account_prices_user_idx" ON "account_prices" ("user_id");

COMMIT;
