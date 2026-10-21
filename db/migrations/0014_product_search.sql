-- UX-6: the catalogue search index.
--
-- The shop searched with `ilike '%term%'` across name, SKU, brand and description — a sequential
-- scan with a LIKE that no btree index can answer. The search now runs against this expression,
-- and GIN answers it. Nothing else changes: no column is added, no data is touched.
--
-- Run any time; safe to re-run.

BEGIN;

CREATE INDEX IF NOT EXISTS "products_search_idx" ON "products" USING gin (to_tsvector('english', coalesce("name", '') || ' ' || coalesce("brand", '') || ' ' || coalesce("sku", '') || ' ' || coalesce("description", '')));

COMMIT;
