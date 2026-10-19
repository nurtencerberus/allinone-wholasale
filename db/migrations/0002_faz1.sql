-- Faz 1 migration for a database created before Faz 1 (after 0001_faz0.sql).
-- Run once in the Neon SQL Editor BEFORE deploying the faz-1 code. Safe to re-run: every
-- statement checks for what already exists, and the opening-stock step only touches products
-- that have no lots yet. A fresh, empty database should use db/schema.sql instead.

BEGIN;

-- Staff two-factor sign-in.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "totp_secret" text;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "totp_pending_secret" text;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "totp_enabled_at" timestamp with time zone;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "totp_last_step" integer;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "recovery_codes" jsonb DEFAULT '[]'::jsonb NOT NULL;

-- Product identity, sourcing, logistics and compliance (URN-1).
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "gtin" text;
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "case_gtin" text;
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "asin" text;
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "mpn" text;
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "manufacturer" text;
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "supplier_name" text;
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "supplier_sku" text;
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "supplier_url" text;
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "cost_price" integer;
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "map_price" integer;
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "units_per_pallet" integer;
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "pallet_ti" integer;
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "pallet_hi" integer;
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "freight_class" text;
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "nmfc" text;
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "hazmat" boolean DEFAULT false NOT NULL;
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "un_number" text;
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "hts_code" text;
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "country_of_origin" text;
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "shelf_life_days" integer;
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "ingredients" text;
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "allergens" jsonb DEFAULT '[]'::jsonb NOT NULL;
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "facts_panel_image" text;
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "fda_disclaimer" boolean DEFAULT false NOT NULL;
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "prop65_warning" text;
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "certifications" jsonb DEFAULT '[]'::jsonb NOT NULL;
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "seo_title" text;
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "seo_description" text;
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "reorder_point" integer DEFAULT 10 NOT NULL;
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now() NOT NULL;

-- Order tax record, refunds and fulfilment dates (ODE-4, ODE-7, VRG-7).
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "admin_notes" text;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "tax_source" text;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "taxable_amount" integer DEFAULT 0 NOT NULL;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "shipping_taxable" integer DEFAULT 0 NOT NULL;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "shipping_tax" integer DEFAULT 0 NOT NULL;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "exemption_cert" text;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "refunded_amount" integer DEFAULT 0 NOT NULL;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "shipped_at" timestamp with time zone;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "delivered_at" timestamp with time zone;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "cancelled_at" timestamp with time zone;
ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "discount" integer DEFAULT 0 NOT NULL;
ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "tax_class" text DEFAULT 'general' NOT NULL;
ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "taxable_amount" integer DEFAULT 0 NOT NULL;
ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "tax_amount" integer DEFAULT 0 NOT NULL;
ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "returned_cases" integer DEFAULT 0 NOT NULL;

-- New tables.
CREATE TABLE IF NOT EXISTS "login_challenges" (
	"token_digest" text PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "audit_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"actor_id" integer,
	"actor_email" text NOT NULL,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text,
	"before" jsonb,
	"after" jsonb,
	"ip" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "product_lots" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" integer NOT NULL,
	"lot_number" text NOT NULL,
	"expires_on" date,
	"supplier" text,
	"qty_received" integer DEFAULT 0 NOT NULL,
	"qty_on_hand" integer DEFAULT 0 NOT NULL,
	"qty_quarantine" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'available' NOT NULL,
	"note" text,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "inventory_movements" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" integer NOT NULL,
	"lot_id" integer,
	"bucket" text DEFAULT 'on_hand' NOT NULL,
	"delta" integer NOT NULL,
	"reason" text NOT NULL,
	"ref_type" text,
	"ref_id" text,
	"note" text,
	"actor_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "order_item_lots" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_item_id" integer NOT NULL,
	"lot_id" integer,
	"lot_number" text NOT NULL,
	"expires_on" date,
	"cases" integer NOT NULL,
	"returned_cases" integer DEFAULT 0 NOT NULL
);

CREATE TABLE IF NOT EXISTS "order_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" integer NOT NULL,
	"type" text NOT NULL,
	"from_value" text,
	"to_value" text,
	"message" text,
	"actor_id" integer,
	"actor_label" text DEFAULT 'system' NOT NULL,
	"visible_to_customer" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "return_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"rma_number" text NOT NULL,
	"order_id" integer NOT NULL,
	"user_id" integer,
	"status" text DEFAULT 'requested' NOT NULL,
	"reason" text NOT NULL,
	"customer_note" text,
	"admin_note" text,
	"refund_goods" integer DEFAULT 0 NOT NULL,
	"refund_tax" integer DEFAULT 0 NOT NULL,
	"refund_shipping" integer DEFAULT 0 NOT NULL,
	"refund_ref" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"received_at" timestamp with time zone,
	"refunded_at" timestamp with time zone
);

CREATE TABLE IF NOT EXISTS "return_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"return_id" integer NOT NULL,
	"order_item_id" integer NOT NULL,
	"cases" integer NOT NULL,
	"condition" text,
	"disposition" text
);

-- Foreign keys (names match Drizzle) and indexes.
DO $$ BEGIN
  ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_lot_id_product_lots_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."product_lots"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "login_challenges" ADD CONSTRAINT "login_challenges_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "order_events" ADD CONSTRAINT "order_events_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "order_events" ADD CONSTRAINT "order_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "order_item_lots" ADD CONSTRAINT "order_item_lots_order_item_id_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "order_item_lots" ADD CONSTRAINT "order_item_lots_lot_id_product_lots_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."product_lots"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "product_lots" ADD CONSTRAINT "product_lots_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "return_items" ADD CONSTRAINT "return_items_return_id_return_requests_id_fk" FOREIGN KEY ("return_id") REFERENCES "public"."return_requests"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "return_items" ADD CONSTRAINT "return_items_order_item_id_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "return_requests" ADD CONSTRAINT "return_requests_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "return_requests" ADD CONSTRAINT "return_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS "audit_log_entity_idx" ON "audit_log" USING btree ("entity_type","entity_id");
CREATE INDEX IF NOT EXISTS "audit_log_created_idx" ON "audit_log" USING btree ("created_at");
CREATE INDEX IF NOT EXISTS "inventory_movements_product_idx" ON "inventory_movements" USING btree ("product_id","created_at");
CREATE INDEX IF NOT EXISTS "inventory_movements_lot_idx" ON "inventory_movements" USING btree ("lot_id");
CREATE INDEX IF NOT EXISTS "order_events_order_idx" ON "order_events" USING btree ("order_id","created_at");
CREATE INDEX IF NOT EXISTS "order_item_lots_item_idx" ON "order_item_lots" USING btree ("order_item_id");
CREATE INDEX IF NOT EXISTS "order_item_lots_lot_idx" ON "order_item_lots" USING btree ("lot_id");
CREATE UNIQUE INDEX IF NOT EXISTS "product_lots_product_lot_unique" ON "product_lots" USING btree ("product_id","lot_number");
CREATE INDEX IF NOT EXISTS "product_lots_product_status_idx" ON "product_lots" USING btree ("product_id","status");
CREATE UNIQUE INDEX IF NOT EXISTS "products_gtin_unique" ON "products" USING btree ("gtin");
CREATE INDEX IF NOT EXISTS "products_asin_idx" ON "products" USING btree ("asin");
CREATE INDEX IF NOT EXISTS "return_items_return_idx" ON "return_items" USING btree ("return_id");
CREATE UNIQUE INDEX IF NOT EXISTS "return_requests_rma_unique" ON "return_requests" USING btree ("rma_number");
CREATE INDEX IF NOT EXISTS "return_requests_order_idx" ON "return_requests" USING btree ("order_id");

-- Data -----------------------------------------------------------------------------------

-- Supplements default to showing the DSHEA disclaimer (first run only: before any lot exists).
-- Untick it per product in the admin when the label makes no structure/function claims.
UPDATE "products" SET "fda_disclaimer" = true WHERE "tax_class" = 'supplement' AND "fda_disclaimer" = false
  AND NOT EXISTS (SELECT 1 FROM "product_lots");

-- Opening stock: every product's current stock becomes one lot, so stock lives only in lots.
-- Food and supplement lots have no best-by date yet — enter it on Admin → Inventory.
WITH opened AS (
  INSERT INTO "product_lots" ("product_id", "lot_number", "expires_on", "qty_received", "qty_on_hand", "note")
  SELECT p."id", p."sku" || '-OPENING', NULL, p."stock", p."stock", 'Opening balance (Faz 1 migration)'
  FROM "products" p
  WHERE p."stock" > 0 AND NOT EXISTS (SELECT 1 FROM "product_lots" l WHERE l."product_id" = p."id")
  RETURNING "id", "product_id", "qty_on_hand"
)
INSERT INTO "inventory_movements" ("product_id", "lot_id", "delta", "reason", "note")
SELECT "product_id", "id", "qty_on_hand", 'opening', 'Opening balance (Faz 1 migration)' FROM opened;

-- Order lines keep their product's tax class; older orders get an approximate tax source.
UPDATE "order_items" i SET "tax_class" = p."tax_class"
  FROM "products" p WHERE p."id" = i."product_id" AND i."tax_class" = 'general' AND p."tax_class" <> 'general';
UPDATE "orders" SET "tax_source" = CASE WHEN "tax_exempt" THEN 'exempt' WHEN "tax_amount" > 0 THEN 'state_rate' ELSE 'no_nexus' END
  WHERE "tax_source" IS NULL;
UPDATE "orders" SET "shipped_at" = "updated_at" WHERE "status" IN ('shipped', 'delivered') AND "shipped_at" IS NULL;
UPDATE "orders" SET "delivered_at" = "updated_at" WHERE "status" = 'delivered' AND "delivered_at" IS NULL;
UPDATE "orders" SET "cancelled_at" = "updated_at" WHERE "status" = 'cancelled' AND "cancelled_at" IS NULL;

COMMIT;
