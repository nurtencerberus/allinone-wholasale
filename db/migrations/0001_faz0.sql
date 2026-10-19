-- Faz 0 migration for a database created from an older db/schema.sql.
-- Run once in the Neon SQL Editor BEFORE deploying the faz-0 code. Safe to re-run.
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

COMMIT;
