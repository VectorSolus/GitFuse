ALTER TABLE "users"
ADD COLUMN IF NOT EXISTS "display_name" text;

UPDATE "users"
SET "display_name" = "github_username"
WHERE "display_name" IS NULL
   OR btrim("display_name") = '';

CREATE TABLE IF NOT EXISTS "oauth_accounts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "provider" text NOT NULL,
  "provider_account_id" text NOT NULL,
  "email" text,
  "display_name" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "oauth_accounts_user_id_users_id_fk"
    FOREIGN KEY ("user_id")
    REFERENCES "users"("id")
    ON DELETE cascade,
  CONSTRAINT "oauth_accounts_provider_account_unique"
    UNIQUE ("provider", "provider_account_id"),
  CONSTRAINT "oauth_accounts_user_provider_unique"
    UNIQUE ("user_id", "provider")
);

CREATE INDEX IF NOT EXISTS "oauth_accounts_user_id_idx"
  ON "oauth_accounts" ("user_id");

INSERT INTO "oauth_accounts" (
  "user_id",
  "provider",
  "provider_account_id",
  "email",
  "display_name"
)
SELECT
  "id",
  split_part("github_id", ':', 1),
  substring("github_id" from position(':' in "github_id") + 1),
  "email",
  "github_username"
FROM "users"
WHERE "github_id" LIKE 'github:%'
   OR "github_id" LIKE 'google:%'
ON CONFLICT ("user_id", "provider")
DO UPDATE SET
  "provider_account_id" = excluded."provider_account_id",
  "email" = excluded."email",
  "display_name" = excluded."display_name",
  "updated_at" = now();

INSERT INTO "oauth_accounts" (
  "user_id",
  "provider",
  "provider_account_id",
  "email",
  "display_name"
)
SELECT
  "id",
  'github',
  "github_id",
  "email",
  "github_username"
FROM "users"
WHERE "github_id" NOT LIKE '%:%'
ON CONFLICT ("user_id", "provider")
DO NOTHING;
