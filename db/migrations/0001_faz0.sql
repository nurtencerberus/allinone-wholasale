-- Faz 0 migration for a database created from an older db/schema.sql.
-- Run once in the Neon SQL Editor BEFORE deploying the faz-0 code. Re-running is harmless
-- apart from invalidating any password-reset or verification links issued since the last run.
-- A fresh, empty database should use db/schema.sql instead.

BEGIN;

-- Sales-tax class per product (NJ exempts food and dietary supplements).
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "tax_class" text DEFAULT 'general' NOT NULL;
UPDATE "products" SET "tax_class" = CASE "category"
  WHEN 'supplements' THEN 'supplement'
  WHEN 'pantry' THEN 'food'
  ELSE 'general' END
WHERE "tax_class" = 'general';

-- Resale certificate on file.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "tax_exempt_cert_type" text;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "tax_exempt_cert_number" text;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "tax_exempt_expires" timestamp with time zone;
-- Exemptions granted before certificates were recorded are suspended until an admin enters one.
UPDATE "users" SET "tax_exempt" = false WHERE "tax_exempt" = true AND "tax_exempt_cert_number" IS NULL;

-- Reset/verification tokens are now stored as digests; links issued before this change stop working.
UPDATE "users" SET "reset_token" = NULL, "reset_expires" = NULL, "verification_token" = NULL, "verification_expires" = NULL;

-- Card checkouts: server-side draft so an authorised payment always becomes an order.
CREATE TABLE IF NOT EXISTS "checkout_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"payment_intent_id" text NOT NULL,
	"user_id" integer NOT NULL,
	"payload" jsonb NOT NULL,
	"amount" integer NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"order_id" integer,
	"failure_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
DO $$ BEGIN
  ALTER TABLE "checkout_sessions" ADD CONSTRAINT "checkout_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "checkout_sessions" ADD CONSTRAINT "checkout_sessions_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE UNIQUE INDEX IF NOT EXISTS "checkout_sessions_pi_unique" ON "checkout_sessions" USING btree ("payment_intent_id");
CREATE INDEX IF NOT EXISTS "checkout_sessions_status_idx" ON "checkout_sessions" USING btree ("status","updated_at");

-- Retried order submits are recognised by this key.
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "idempotency_key" text;
CREATE UNIQUE INDEX IF NOT EXISTS "orders_idempotency_key_unique" ON "orders" USING btree ("idempotency_key");

COMMIT;
