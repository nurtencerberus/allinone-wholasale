-- UX-7: requests for quote (after 0009_account_prices.sql). A trade buyer asks for a price on
-- specific quantities, the desk prices each line with a deadline, and accepting writes the
-- agreed prices into account_prices. Run before the deploy that reads it; safe to re-run.

BEGIN;

CREATE TABLE IF NOT EXISTS "quote_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"reference" text NOT NULL,
	"user_id" integer NOT NULL,
	"status" text DEFAULT 'requested' NOT NULL,
	"customer_note" text,
	"admin_note" text,
	"expires_at" timestamp with time zone,
	"quoted_by" integer,
	"quoted_at" timestamp with time zone,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "quote_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"quote_id" integer NOT NULL,
	"product_id" integer NOT NULL,
	"cases" integer NOT NULL,
	"case_price" integer,
	"note" text
);

DO $$ BEGIN
  ALTER TABLE "quote_requests" ADD CONSTRAINT "quote_requests_user_id_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "quote_requests" ADD CONSTRAINT "quote_requests_quoted_by_users_id_fk"
    FOREIGN KEY ("quoted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "quote_items" ADD CONSTRAINT "quote_items_quote_id_quote_requests_id_fk"
    FOREIGN KEY ("quote_id") REFERENCES "public"."quote_requests"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "quote_items" ADD CONSTRAINT "quote_items_product_id_products_id_fk"
    FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "quote_requests_reference_unique" ON "quote_requests" ("reference");
CREATE INDEX IF NOT EXISTS "quote_requests_user_idx" ON "quote_requests" ("user_id", "created_at");
CREATE INDEX IF NOT EXISTS "quote_requests_status_idx" ON "quote_requests" ("status");
CREATE UNIQUE INDEX IF NOT EXISTS "quote_items_product_unique" ON "quote_items" ("quote_id", "product_id");

COMMIT;
