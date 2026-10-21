CREATE TABLE "account_prices" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"company_id" integer,
	"product_id" integer NOT NULL,
	"case_price" integer NOT NULL,
	"min_cases" integer,
	"starts_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"note" text,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "addresses" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"label" text NOT NULL,
	"name" text NOT NULL,
	"company" text,
	"line1" text NOT NULL,
	"line2" text,
	"city" text NOT NULL,
	"state" text NOT NULL,
	"zip" text NOT NULL,
	"phone" text,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "application_documents" (
	"id" serial PRIMARY KEY NOT NULL,
	"application_id" integer NOT NULL,
	"kind" text NOT NULL,
	"filename" text NOT NULL,
	"mime" text NOT NULL,
	"bytes" integer NOT NULL,
	"content" "bytea" NOT NULL,
	"uploaded_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "audit_log" (
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

CREATE TABLE "cart_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"cart_id" integer NOT NULL,
	"product_id" integer NOT NULL,
	"cases" integer NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "carts" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reminded_at" timestamp with time zone
);

CREATE TABLE "checkout_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"payment_intent_id" text NOT NULL,
	"user_id" integer NOT NULL,
	"payload" jsonb NOT NULL,
	"amount" integer NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"order_id" integer,
	"failure_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "companies" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"account_tier" text DEFAULT 'retail' NOT NULL,
	"wholesale_discount_pct" integer DEFAULT 0 NOT NULL,
	"tax_exempt" boolean DEFAULT false NOT NULL,
	"tax_exempt_state" text,
	"tax_exempt_cert_type" text,
	"tax_exempt_cert_number" text,
	"tax_exempt_expires" timestamp with time zone,
	"ein" text,
	"credit_limit" integer DEFAULT 0 NOT NULL,
	"payment_terms_days" integer DEFAULT 30 NOT NULL,
	"credit_hold" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "company_invites" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"email" text NOT NULL,
	"company_role" text DEFAULT 'buyer' NOT NULL,
	"token_digest" text NOT NULL,
	"invited_by" integer,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "coupon_redemptions" (
	"id" serial PRIMARY KEY NOT NULL,
	"coupon_id" integer NOT NULL,
	"order_id" integer NOT NULL,
	"user_id" integer,
	"email" text NOT NULL,
	"amount" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "coupons" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"kind" text NOT NULL,
	"value" integer NOT NULL,
	"min_subtotal" integer DEFAULT 0 NOT NULL,
	"description" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"starts_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"max_redemptions" integer,
	"per_customer_limit" integer,
	"allowed_tiers" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"stackable" boolean DEFAULT true NOT NULL,
	"redeemed_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "inventory_movements" (
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

CREATE TABLE "login_challenges" (
	"token_digest" text PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "order_events" (
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

CREATE TABLE "order_item_lots" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_item_id" integer NOT NULL,
	"lot_id" integer,
	"lot_number" text NOT NULL,
	"expires_on" date,
	"cases" integer NOT NULL,
	"returned_cases" integer DEFAULT 0 NOT NULL
);

CREATE TABLE "order_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" integer NOT NULL,
	"product_id" integer,
	"name" text NOT NULL,
	"sku" text NOT NULL,
	"image" text NOT NULL,
	"cases" integer NOT NULL,
	"units_per_case" integer NOT NULL,
	"unit_price" integer NOT NULL,
	"line_total" integer NOT NULL,
	"discount" integer DEFAULT 0 NOT NULL,
	"tax_class" text DEFAULT 'general' NOT NULL,
	"taxable_amount" integer DEFAULT 0 NOT NULL,
	"tax_amount" integer DEFAULT 0 NOT NULL,
	"returned_cases" integer DEFAULT 0 NOT NULL
);

CREATE TABLE "orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_number" text NOT NULL,
	"user_id" integer,
	"due_at" timestamp with time zone,
	"company_id" integer,
	"email" text NOT NULL,
	"customer_name" text NOT NULL,
	"company" text,
	"phone" text,
	"status" text DEFAULT 'processing' NOT NULL,
	"shipping_address" jsonb NOT NULL,
	"shipping_service" text NOT NULL,
	"shipping_carrier" text NOT NULL,
	"tracking_number" text,
	"tracking_url" text,
	"subtotal" integer NOT NULL,
	"account_discount" integer DEFAULT 0 NOT NULL,
	"coupon_code" text,
	"coupon_discount" integer DEFAULT 0 NOT NULL,
	"shipping_cost" integer DEFAULT 0 NOT NULL,
	"tax_rate_x1000" double precision DEFAULT 0 NOT NULL,
	"tax_amount" integer DEFAULT 0 NOT NULL,
	"tax_exempt" boolean DEFAULT false NOT NULL,
	"total" integer NOT NULL,
	"is_wholesale" boolean DEFAULT false NOT NULL,
	"payment_status" text DEFAULT 'paid' NOT NULL,
	"payment_method" text DEFAULT 'card' NOT NULL,
	"po_number" text,
	"access_token" text,
	"payment_ref" text,
	"idempotency_key" text,
	"notes" text,
	"admin_notes" text,
	"tax_source" text,
	"taxable_amount" integer DEFAULT 0 NOT NULL,
	"shipping_taxable" integer DEFAULT 0 NOT NULL,
	"shipping_tax" integer DEFAULT 0 NOT NULL,
	"exemption_cert" text,
	"refunded_amount" integer DEFAULT 0 NOT NULL,
	"shipped_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "product_images" (
	"id" serial PRIMARY KEY NOT NULL,
	"filename" text NOT NULL,
	"mime" text NOT NULL,
	"bytes" integer NOT NULL,
	"content" "bytea" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "product_lots" (
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

CREATE TABLE "products" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"sku" text NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"tagline" text NOT NULL,
	"description" text NOT NULL,
	"story" text NOT NULL,
	"brand" text NOT NULL,
	"origin" text NOT NULL,
	"msrp_unit" integer NOT NULL,
	"case_price" integer NOT NULL,
	"case_size" integer NOT NULL,
	"min_cases" integer DEFAULT 1 NOT NULL,
	"price_tiers" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"weight_oz" integer NOT NULL,
	"dimensions" jsonb NOT NULL,
	"stock" integer DEFAULT 0 NOT NULL,
	"lead_time_days" integer DEFAULT 2 NOT NULL,
	"rating_x10" integer DEFAULT 45 NOT NULL,
	"review_count" integer DEFAULT 0 NOT NULL,
	"image" text NOT NULL,
	"images" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"features" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"specs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"badges" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"featured" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"tax_class" text DEFAULT 'general' NOT NULL,
	"gtin" text,
	"case_gtin" text,
	"asin" text,
	"mpn" text,
	"manufacturer" text,
	"supplier_name" text,
	"supplier_sku" text,
	"supplier_url" text,
	"cost_price" integer,
	"map_price" integer,
	"units_per_pallet" integer,
	"pallet_ti" integer,
	"pallet_hi" integer,
	"freight_class" text,
	"nmfc" text,
	"hazmat" boolean DEFAULT false NOT NULL,
	"un_number" text,
	"hts_code" text,
	"country_of_origin" text,
	"shelf_life_days" integer,
	"ingredients" text,
	"allergens" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"facts_panel_image" text,
	"fda_disclaimer" boolean DEFAULT false NOT NULL,
	"prop65_warning" text,
	"certifications" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"seo_title" text,
	"seo_description" text,
	"reorder_point" integer DEFAULT 10 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "quote_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"quote_id" integer NOT NULL,
	"product_id" integer NOT NULL,
	"cases" integer NOT NULL,
	"case_price" integer,
	"note" text
);

CREATE TABLE "quote_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"reference" text NOT NULL,
	"user_id" integer NOT NULL,
	"company_id" integer,
	"status" text DEFAULT 'requested' NOT NULL,
	"customer_note" text,
	"admin_note" text,
	"expires_at" timestamp with time zone,
	"quoted_by" integer,
	"quoted_at" timestamp with time zone,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "rate_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"reset_at" timestamp with time zone NOT NULL
);

CREATE TABLE "return_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"return_id" integer NOT NULL,
	"order_item_id" integer NOT NULL,
	"cases" integer NOT NULL,
	"condition" text,
	"disposition" text
);

CREATE TABLE "return_requests" (
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

CREATE TABLE "reviews" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" integer NOT NULL,
	"author" text NOT NULL,
	"company" text,
	"rating" integer NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"verified" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "sessions" (
	"token" text PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"name" text NOT NULL,
	"company" text,
	"phone" text,
	"role" text DEFAULT 'customer' NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"verification_token" text,
	"verification_expires" timestamp with time zone,
	"reset_token" text,
	"reset_expires" timestamp with time zone,
	"account_tier" text DEFAULT 'retail' NOT NULL,
	"wholesale_discount_pct" integer DEFAULT 0 NOT NULL,
	"tax_exempt" boolean DEFAULT false NOT NULL,
	"tax_exempt_state" text,
	"tax_exempt_cert_type" text,
	"tax_exempt_cert_number" text,
	"tax_exempt_expires" timestamp with time zone,
	"ein" text,
	"credit_limit" integer DEFAULT 0 NOT NULL,
	"payment_terms_days" integer DEFAULT 30 NOT NULL,
	"credit_hold" boolean DEFAULT false NOT NULL,
	"company_id" integer,
	"company_role" text,
	"totp_secret" text,
	"totp_pending_secret" text,
	"totp_enabled_at" timestamp with time zone,
	"totp_last_step" integer,
	"recovery_codes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "wholesale_applications" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"company_name" text NOT NULL,
	"ein" text NOT NULL,
	"business_type" text NOT NULL,
	"contact_name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text NOT NULL,
	"website" text,
	"address_line1" text NOT NULL,
	"city" text NOT NULL,
	"state" text NOT NULL,
	"zip" text NOT NULL,
	"annual_volume" text NOT NULL,
	"categories" text NOT NULL,
	"notes" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"rejection_reason" text,
	"discount_pct" integer DEFAULT 0 NOT NULL,
	"tax_exempt" boolean DEFAULT false NOT NULL,
	"verified_ein" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_at" timestamp with time zone
);

CREATE TABLE "wholesale_lists" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"supplier" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"category" text DEFAULT 'mixed' NOT NULL,
	"audience" text DEFAULT 'public' NOT NULL,
	"filename" text NOT NULL,
	"format" text NOT NULL,
	"bytes" integer NOT NULL,
	"row_count" integer DEFAULT 0 NOT NULL,
	"columns" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"preview" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"content" "bytea" NOT NULL,
	"published" boolean DEFAULT true NOT NULL,
	"downloads" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "account_prices" ADD CONSTRAINT "account_prices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "account_prices" ADD CONSTRAINT "account_prices_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "account_prices" ADD CONSTRAINT "account_prices_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "account_prices" ADD CONSTRAINT "account_prices_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "addresses" ADD CONSTRAINT "addresses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "application_documents" ADD CONSTRAINT "application_documents_application_id_wholesale_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."wholesale_applications"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "application_documents" ADD CONSTRAINT "application_documents_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_cart_id_carts_id_fk" FOREIGN KEY ("cart_id") REFERENCES "public"."carts"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "carts" ADD CONSTRAINT "carts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "checkout_sessions" ADD CONSTRAINT "checkout_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "checkout_sessions" ADD CONSTRAINT "checkout_sessions_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "company_invites" ADD CONSTRAINT "company_invites_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "company_invites" ADD CONSTRAINT "company_invites_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_coupon_id_coupons_id_fk" FOREIGN KEY ("coupon_id") REFERENCES "public"."coupons"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_lot_id_product_lots_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."product_lots"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "login_challenges" ADD CONSTRAINT "login_challenges_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "order_events" ADD CONSTRAINT "order_events_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "order_events" ADD CONSTRAINT "order_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "order_item_lots" ADD CONSTRAINT "order_item_lots_order_item_id_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "order_item_lots" ADD CONSTRAINT "order_item_lots_lot_id_product_lots_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."product_lots"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "orders" ADD CONSTRAINT "orders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "orders" ADD CONSTRAINT "orders_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "product_lots" ADD CONSTRAINT "product_lots_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "quote_items" ADD CONSTRAINT "quote_items_quote_id_quote_requests_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."quote_requests"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "quote_items" ADD CONSTRAINT "quote_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "quote_requests" ADD CONSTRAINT "quote_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "quote_requests" ADD CONSTRAINT "quote_requests_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "quote_requests" ADD CONSTRAINT "quote_requests_quoted_by_users_id_fk" FOREIGN KEY ("quoted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "return_items" ADD CONSTRAINT "return_items_return_id_return_requests_id_fk" FOREIGN KEY ("return_id") REFERENCES "public"."return_requests"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "return_items" ADD CONSTRAINT "return_items_order_item_id_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "return_requests" ADD CONSTRAINT "return_requests_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "return_requests" ADD CONSTRAINT "return_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "users" ADD CONSTRAINT "users_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "wholesale_applications" ADD CONSTRAINT "wholesale_applications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
CREATE UNIQUE INDEX "account_prices_account_product_unique" ON "account_prices" USING btree ("user_id","product_id");
CREATE INDEX "account_prices_user_idx" ON "account_prices" USING btree ("user_id");
CREATE INDEX "addresses_user_idx" ON "addresses" USING btree ("user_id");
CREATE INDEX "application_documents_application_idx" ON "application_documents" USING btree ("application_id");
CREATE INDEX "audit_log_entity_idx" ON "audit_log" USING btree ("entity_type","entity_id");
CREATE INDEX "audit_log_created_idx" ON "audit_log" USING btree ("created_at");
CREATE UNIQUE INDEX "cart_items_product_unique" ON "cart_items" USING btree ("cart_id","product_id");
CREATE UNIQUE INDEX "carts_user_unique" ON "carts" USING btree ("user_id");
CREATE INDEX "carts_updated_idx" ON "carts" USING btree ("updated_at");
CREATE UNIQUE INDEX "checkout_sessions_pi_unique" ON "checkout_sessions" USING btree ("payment_intent_id");
CREATE INDEX "checkout_sessions_status_idx" ON "checkout_sessions" USING btree ("status","updated_at");
CREATE INDEX "companies_name_idx" ON "companies" USING btree ("name");
CREATE UNIQUE INDEX "company_invites_token_unique" ON "company_invites" USING btree ("token_digest");
CREATE INDEX "company_invites_company_idx" ON "company_invites" USING btree ("company_id");
CREATE UNIQUE INDEX "coupon_redemptions_order_unique" ON "coupon_redemptions" USING btree ("coupon_id","order_id");
CREATE INDEX "coupon_redemptions_customer_idx" ON "coupon_redemptions" USING btree ("coupon_id","user_id");
CREATE UNIQUE INDEX "coupons_code_unique" ON "coupons" USING btree ("code");
CREATE INDEX "inventory_movements_product_idx" ON "inventory_movements" USING btree ("product_id","created_at");
CREATE INDEX "inventory_movements_lot_idx" ON "inventory_movements" USING btree ("lot_id");
CREATE INDEX "order_events_order_idx" ON "order_events" USING btree ("order_id","created_at");
CREATE INDEX "order_item_lots_item_idx" ON "order_item_lots" USING btree ("order_item_id");
CREATE INDEX "order_item_lots_lot_idx" ON "order_item_lots" USING btree ("lot_id");
CREATE INDEX "order_items_order_idx" ON "order_items" USING btree ("order_id");
CREATE UNIQUE INDEX "orders_number_unique" ON "orders" USING btree ("order_number");
CREATE UNIQUE INDEX "orders_payment_ref_unique" ON "orders" USING btree ("payment_ref");
CREATE UNIQUE INDEX "orders_idempotency_key_unique" ON "orders" USING btree ("idempotency_key");
CREATE INDEX "orders_user_idx" ON "orders" USING btree ("user_id");
CREATE INDEX "orders_email_idx" ON "orders" USING btree ("email");
CREATE INDEX "orders_created_idx" ON "orders" USING btree ("created_at");
CREATE UNIQUE INDEX "product_lots_product_lot_unique" ON "product_lots" USING btree ("product_id","lot_number");
CREATE INDEX "product_lots_product_status_idx" ON "product_lots" USING btree ("product_id","status");
CREATE UNIQUE INDEX "products_slug_unique" ON "products" USING btree ("slug");
CREATE UNIQUE INDEX "products_sku_unique" ON "products" USING btree ("sku");
CREATE UNIQUE INDEX "products_gtin_unique" ON "products" USING btree ("gtin");
CREATE INDEX "products_asin_idx" ON "products" USING btree ("asin");
CREATE INDEX "products_category_idx" ON "products" USING btree ("category");
CREATE INDEX "products_active_featured_idx" ON "products" USING btree ("active","featured");
CREATE INDEX "products_search_idx" ON "products" USING gin (to_tsvector('english', coalesce("name", '') || ' ' || coalesce("brand", '') || ' ' || coalesce("sku", '') || ' ' || coalesce("description", '')));
CREATE UNIQUE INDEX "quote_items_product_unique" ON "quote_items" USING btree ("quote_id","product_id");
CREATE UNIQUE INDEX "quote_requests_reference_unique" ON "quote_requests" USING btree ("reference");
CREATE INDEX "quote_requests_user_idx" ON "quote_requests" USING btree ("user_id","created_at");
CREATE INDEX "quote_requests_status_idx" ON "quote_requests" USING btree ("status");
CREATE INDEX "rate_limits_reset_idx" ON "rate_limits" USING btree ("reset_at");
CREATE INDEX "return_items_return_idx" ON "return_items" USING btree ("return_id");
CREATE UNIQUE INDEX "return_items_line_unique" ON "return_items" USING btree ("return_id","order_item_id");
CREATE UNIQUE INDEX "return_requests_rma_unique" ON "return_requests" USING btree ("rma_number");
CREATE INDEX "return_requests_order_idx" ON "return_requests" USING btree ("order_id");
CREATE INDEX "reviews_product_idx" ON "reviews" USING btree ("product_id");
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");
CREATE INDEX "sessions_expires_idx" ON "sessions" USING btree ("expires_at");
CREATE UNIQUE INDEX "users_email_unique" ON "users" USING btree ("email");
CREATE INDEX "users_verification_token_idx" ON "users" USING btree ("verification_token");
CREATE INDEX "users_reset_token_idx" ON "users" USING btree ("reset_token");
CREATE INDEX "wholesale_lists_published_idx" ON "wholesale_lists" USING btree ("published");
