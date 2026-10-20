-- SEP-7: the signed-in buyer's cart on the server (after 0007_performance_indexes.sql).
-- Guests keep theirs in local storage; a trade account's cart now follows them between devices
-- and gives the nightly job one abandoned-cart reminder to send. Run any time; safe to re-run.

BEGIN;

CREATE TABLE IF NOT EXISTS "carts" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reminded_at" timestamp with time zone
);

CREATE TABLE IF NOT EXISTS "cart_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"cart_id" integer NOT NULL,
	"product_id" integer NOT NULL,
	"cases" integer NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$ BEGIN
  ALTER TABLE "carts" ADD CONSTRAINT "carts_user_id_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_cart_id_carts_id_fk"
    FOREIGN KEY ("cart_id") REFERENCES "public"."carts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_product_id_products_id_fk"
    FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "carts_user_unique" ON "carts" ("user_id");
CREATE INDEX IF NOT EXISTS "carts_updated_idx" ON "carts" ("updated_at");
CREATE UNIQUE INDEX IF NOT EXISTS "cart_items_product_unique" ON "cart_items" ("cart_id", "product_id");

COMMIT;
