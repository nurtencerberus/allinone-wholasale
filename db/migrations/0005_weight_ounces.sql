-- KRG-6, 1/2: case weight gains a whole-ounce column (after 0004_coupon_rules.sql).
-- A 0.6 lb carton used to be stored as 0 or 1 whole pound, which threw dimensional freight off
-- badly on light goods. Everything a person sees or imports is still in pounds (src/lib/weight.ts).
--
-- Run this one BEFORE deploying the Faz 2 freight code: it only adds and fills "weight_oz" and
-- makes the old column optional, so the code running right now keeps working. The old column is
-- dropped afterwards by 0006_drop_weight_lbs.sql. Safe to re-run.

BEGIN;

ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "weight_oz" integer;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'weight_lbs') THEN
    UPDATE "products" SET "weight_oz" = "weight_lbs" * 16 WHERE "weight_oz" IS NULL;
    -- The new code never writes the old column, so it must not be mandatory any more.
    ALTER TABLE "products" ALTER COLUMN "weight_lbs" DROP NOT NULL;
  END IF;
END $$;

-- A product with no weight at all would break freight pricing; 1 lb was the old column's floor.
UPDATE "products" SET "weight_oz" = 16 WHERE "weight_oz" IS NULL;

ALTER TABLE "products" ALTER COLUMN "weight_oz" SET NOT NULL;

COMMIT;
