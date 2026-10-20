-- SEP-6: coupon rules (after 0003_return_items_unique.sql). Dates, usage limits, tier
-- restriction, stacking rule and a redemption record per order. Existing coupons keep working:
-- no window, no limit, every tier, stackable.
-- Run once in the Neon SQL Editor. Safe to re-run.

BEGIN;

ALTER TABLE "coupons" ADD COLUMN IF NOT EXISTS "starts_at" timestamp with time zone;
ALTER TABLE "coupons" ADD COLUMN IF NOT EXISTS "expires_at" timestamp with time zone;
ALTER TABLE "coupons" ADD COLUMN IF NOT EXISTS "max_redemptions" integer;
ALTER TABLE "coupons" ADD COLUMN IF NOT EXISTS "per_customer_limit" integer;
ALTER TABLE "coupons" ADD COLUMN IF NOT EXISTS "allowed_tiers" jsonb DEFAULT '[]'::jsonb NOT NULL;
ALTER TABLE "coupons" ADD COLUMN IF NOT EXISTS "stackable" boolean DEFAULT true NOT NULL;
ALTER TABLE "coupons" ADD COLUMN IF NOT EXISTS "redeemed_count" integer DEFAULT 0 NOT NULL;

CREATE TABLE IF NOT EXISTS "coupon_redemptions" (
	"id" serial PRIMARY KEY NOT NULL,
	"coupon_id" integer NOT NULL,
	"order_id" integer NOT NULL,
	"user_id" integer,
	"email" text NOT NULL,
	"amount" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$ BEGIN
  ALTER TABLE "coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_coupon_id_coupons_id_fk"
    FOREIGN KEY ("coupon_id") REFERENCES "public"."coupons"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_order_id_orders_id_fk"
    FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_user_id_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "coupon_redemptions_order_unique" ON "coupon_redemptions" ("coupon_id", "order_id");
CREATE INDEX IF NOT EXISTS "coupon_redemptions_customer_idx" ON "coupon_redemptions" ("coupon_id", "user_id");

-- Orders already placed with a coupon become their own redemption record, so the counters
-- start from the truth rather than from zero.
INSERT INTO "coupon_redemptions" ("coupon_id", "order_id", "user_id", "email", "amount", "created_at")
SELECT c."id", o."id", o."user_id", o."email", o."coupon_discount", o."created_at"
FROM "orders" o JOIN "coupons" c ON upper(c."code") = upper(o."coupon_code")
WHERE o."coupon_code" IS NOT NULL
ON CONFLICT ("coupon_id", "order_id") DO NOTHING;

UPDATE "coupons" c SET "redeemed_count" = used."count"
FROM (SELECT "coupon_id", count(*)::int AS "count" FROM "coupon_redemptions" GROUP BY "coupon_id") used
WHERE used."coupon_id" = c."id" AND c."redeemed_count" <> used."count";

COMMIT;
