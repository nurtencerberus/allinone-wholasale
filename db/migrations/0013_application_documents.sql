-- KYT-11: paperwork attached to a wholesale application (after 0012_credit_terms.sql).
-- Resale certificate, W-9 or licence, stored in the database like product photos because
-- Vercel has no disk and these need the same access control as the application itself.
-- Run before the deploy that reads it; safe to re-run.

BEGIN;

CREATE TABLE IF NOT EXISTS "application_documents" (
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

DO $$ BEGIN
  ALTER TABLE "application_documents" ADD CONSTRAINT "application_documents_application_id_wholesale_applications_id_fk"
    FOREIGN KEY ("application_id") REFERENCES "public"."wholesale_applications"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "application_documents" ADD CONSTRAINT "application_documents_uploaded_by_users_id_fk"
    FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "application_documents_application_idx" ON "application_documents" ("application_id");

-- EINs are compared without punctuation from now on; store the one shape everywhere.
UPDATE "wholesale_applications"
   SET "ein" = substring(regexp_replace("ein", '[^0-9]', '', 'g') from 1 for 2) || '-' ||
               substring(regexp_replace("ein", '[^0-9]', '', 'g') from 3)
 WHERE length(regexp_replace("ein", '[^0-9]', '', 'g')) = 9
   AND "ein" <> substring(regexp_replace("ein", '[^0-9]', '', 'g') from 1 for 2) || '-' ||
                substring(regexp_replace("ein", '[^0-9]', '', 'g') from 3);

UPDATE "users"
   SET "ein" = substring(regexp_replace("ein", '[^0-9]', '', 'g') from 1 for 2) || '-' ||
               substring(regexp_replace("ein", '[^0-9]', '', 'g') from 3)
 WHERE "ein" IS NOT NULL
   AND length(regexp_replace("ein", '[^0-9]', '', 'g')) = 9
   AND "ein" <> substring(regexp_replace("ein", '[^0-9]', '', 'g') from 1 for 2) || '-' ||
                substring(regexp_replace("ein", '[^0-9]', '', 'g') from 3);

COMMIT;
