-- One return_items row per order line (after 0002_faz1.sql). Before this index a return request
-- that named the same line twice passed the per-line cap once for each row and was refunded
-- twice; the code now merges the lines, and the index keeps old payloads out for good.
-- Run once in the Neon SQL Editor. Safe to re-run.

BEGIN;

-- Fold any duplicates already on file into the first row of each (return, line) pair.
WITH merged AS (
  SELECT min("id") AS keep_id, "return_id", "order_item_id", sum("cases")::int AS total
  FROM "return_items"
  GROUP BY "return_id", "order_item_id"
  HAVING count(*) > 1
)
UPDATE "return_items" i SET "cases" = m."total" FROM merged m WHERE i."id" = m."keep_id";

DELETE FROM "return_items" i
  USING "return_items" j
  WHERE i."return_id" = j."return_id" AND i."order_item_id" = j."order_item_id" AND i."id" > j."id";

CREATE UNIQUE INDEX IF NOT EXISTS "return_items_line_unique" ON "return_items" ("return_id", "order_item_id");

COMMIT;
