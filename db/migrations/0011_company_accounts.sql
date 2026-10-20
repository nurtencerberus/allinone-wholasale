-- UX-7: company accounts (after 0010_quote_requests.sql). Several people buy for one business
-- and share its terms, agreed prices, quotes and order history.
--
-- Nothing is merged by name: existing accounts keep buying exactly as they do today, with no
-- company at all, until an owner creates one from /account/team. That is deliberate — joining
-- two accounts because they typed the same company name would hand one buyer another's order
-- history. Run before the deploy that reads it; safe to re-run.

BEGIN;

CREATE TABLE IF NOT EXISTS "companies" (
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
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "company_invites" (
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

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "company_id" integer;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "company_role" text;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "company_id" integer;
ALTER TABLE "account_prices" ADD COLUMN IF NOT EXISTS "company_id" integer;
ALTER TABLE "quote_requests" ADD COLUMN IF NOT EXISTS "company_id" integer;

DO $$ BEGIN
  ALTER TABLE "company_invites" ADD CONSTRAINT "company_invites_company_id_companies_id_fk"
    FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "company_invites" ADD CONSTRAINT "company_invites_invited_by_users_id_fk"
    FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "users" ADD CONSTRAINT "users_company_id_companies_id_fk"
    FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "orders" ADD CONSTRAINT "orders_company_id_companies_id_fk"
    FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "account_prices" ADD CONSTRAINT "account_prices_company_id_companies_id_fk"
    FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "quote_requests" ADD CONSTRAINT "quote_requests_company_id_companies_id_fk"
    FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "companies_name_idx" ON "companies" ("name");
CREATE UNIQUE INDEX IF NOT EXISTS "company_invites_token_unique" ON "company_invites" ("token_digest");
CREATE INDEX IF NOT EXISTS "company_invites_company_idx" ON "company_invites" ("company_id");

COMMIT;
