-- KRG-6: case weight moves from whole pounds to whole ounces (after 0004_coupon_rules.sql).
-- A 0.6 lb carton used to be stored as 0 or 1 lb, which threw dimensional freight off badly on
-- light goods. Everything a person sees or imports is still in pounds (src/lib/weight.ts).
-- Run once in the Neon SQL Editor, in the same deploy as the Faz 2 freight code. Safe to re-run.

BEGIN;

ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "weight_oz" integer;

UPDATE "products" SET "weight_oz" = "weight_lbs" * 16
  WHERE "weight_oz" IS NULL AND "weight_lbs" IS NOT NULL;

-- Anything still missing a weight would break freight pricing; 1 lb is the old column's floor.
UPDATE "products" SET "weight_oz" = 16 WHERE "weight_oz" IS NULL;

ALTER TABLE "products" ALTER COLUMN "weight_oz" SET NOT NULL;
ALTER TABLE "products" DROP COLUMN IF EXISTS "weight_lbs";

COMMIT;
