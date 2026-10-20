-- PRF-3: indexes for the lookups that had none (after 0006_drop_weight_lbs.sql).
-- Sign-in token lookups, the account's order history, the admin lists and the nightly cleanup
-- all scanned their tables. Every index is created concurrently-safe (IF NOT EXISTS) and the
-- migration touches no data. Run any time; safe to re-run.

BEGIN;

CREATE INDEX IF NOT EXISTS "users_verification_token_idx" ON "users" ("verification_token");
CREATE INDEX IF NOT EXISTS "users_reset_token_idx" ON "users" ("reset_token");
CREATE INDEX IF NOT EXISTS "sessions_expires_idx" ON "sessions" ("expires_at");
CREATE INDEX IF NOT EXISTS "rate_limits_reset_idx" ON "rate_limits" ("reset_at");
CREATE INDEX IF NOT EXISTS "products_active_featured_idx" ON "products" ("active", "featured");
CREATE INDEX IF NOT EXISTS "orders_email_idx" ON "orders" ("email");
CREATE INDEX IF NOT EXISTS "orders_created_idx" ON "orders" ("created_at");

COMMIT;
