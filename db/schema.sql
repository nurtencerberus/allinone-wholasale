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

CREATE TABLE "coupons" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"kind" text NOT NULL,
	"value" integer NOT NULL,
	"min_subtotal" integer DEFAULT 0 NOT NULL,
	"description" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
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
	"line_total" integer NOT NULL
);

CREATE TABLE "orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_number" text NOT NULL,
	"user_id" integer,
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
	"notes" text,
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
	"weight_lbs" integer NOT NULL,
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
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "rate_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"reset_at" timestamp with time zone NOT NULL
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
	"ein" text,
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

ALTER TABLE "addresses" ADD CONSTRAINT "addresses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "orders" ADD CONSTRAINT "orders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "wholesale_applications" ADD CONSTRAINT "wholesale_applications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
CREATE INDEX "addresses_user_idx" ON "addresses" USING btree ("user_id");
CREATE UNIQUE INDEX "coupons_code_unique" ON "coupons" USING btree ("code");
CREATE INDEX "order_items_order_idx" ON "order_items" USING btree ("order_id");
CREATE UNIQUE INDEX "orders_number_unique" ON "orders" USING btree ("order_number");
CREATE UNIQUE INDEX "orders_payment_ref_unique" ON "orders" USING btree ("payment_ref");
CREATE INDEX "orders_user_idx" ON "orders" USING btree ("user_id");
CREATE UNIQUE INDEX "products_slug_unique" ON "products" USING btree ("slug");
CREATE UNIQUE INDEX "products_sku_unique" ON "products" USING btree ("sku");
CREATE INDEX "products_category_idx" ON "products" USING btree ("category");
CREATE INDEX "reviews_product_idx" ON "reviews" USING btree ("product_id");
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");
CREATE UNIQUE INDEX "users_email_unique" ON "users" USING btree ("email");
CREATE INDEX "wholesale_lists_published_idx" ON "wholesale_lists" USING btree ("published");
