DO $$
BEGIN
  CREATE TYPE "public"."account_tier" AS ENUM('free', 'paid');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "users"
ADD COLUMN IF NOT EXISTS "tier" "account_tier" DEFAULT 'free' NOT NULL;

ALTER TABLE "users"
ADD COLUMN IF NOT EXISTS "tier_updated_at" timestamp with time zone DEFAULT now() NOT NULL;

ALTER TABLE "users"
ADD COLUMN IF NOT EXISTS "email_verified_at" timestamp with time zone;

UPDATE "users"
SET "tier" = CASE
    WHEN "plans"."tier" = 'free' THEN 'free'::"account_tier"
    ELSE 'paid'::"account_tier"
  END,
  "tier_updated_at" = coalesce("plans"."updated_at", "users"."updated_at", now())
FROM "plans"
WHERE "plans"."user_id" = "users"."id";

ALTER TABLE "devices"
ADD COLUMN IF NOT EXISTS "public_key_fingerprint" text;

ALTER TABLE "devices"
ADD COLUMN IF NOT EXISTS "first_synced_at" timestamp with time zone DEFAULT now() NOT NULL;

ALTER TABLE "devices"
ADD COLUMN IF NOT EXISTS "last_synced_at" timestamp with time zone;

ALTER TABLE "cli_auth_sessions"
ADD COLUMN IF NOT EXISTS "device_id" uuid;

UPDATE "devices"
SET "public_key_fingerprint" = coalesce("public_key_fingerprint", "token_hash"),
  "first_synced_at" = coalesce("first_synced_at", "created_at", now()),
  "last_synced_at" = coalesce("last_synced_at", "last_active_at", "created_at")
WHERE "public_key_fingerprint" IS NULL
   OR "last_synced_at" IS NULL;
