-- KRG-6, 2/2: drop the old pound column once the Faz 2 freight code is live.
-- Run this AFTER the deploy that reads "weight_oz" is serving traffic. Until it runs, the old
-- and the new code can both run against the same database. Safe to re-run.

BEGIN;

ALTER TABLE "products" DROP COLUMN IF EXISTS "weight_lbs";

COMMIT;
