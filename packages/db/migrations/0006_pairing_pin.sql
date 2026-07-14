ALTER TABLE "users"
ADD COLUMN IF NOT EXISTS "pairing_pin_hash" text;

ALTER TABLE "users"
ADD COLUMN IF NOT EXISTS "pairing_pin_updated_at" timestamp with time zone;

CREATE TABLE IF NOT EXISTS "pairing_attempts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid,
  "email_attempted" text NOT NULL,
  "ip_address" text NOT NULL,
  "device_name" text,
  "success" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "pairing_attempts_user_id_users_id_fk"
    FOREIGN KEY ("user_id")
    REFERENCES "users"("id")
    ON DELETE cascade
);

CREATE INDEX IF NOT EXISTS "pairing_attempts_email_created_idx"
  ON "pairing_attempts" ("email_attempted", "created_at");

CREATE INDEX IF NOT EXISTS "pairing_attempts_ip_created_idx"
  ON "pairing_attempts" ("ip_address", "created_at");

CREATE INDEX IF NOT EXISTS "pairing_attempts_user_created_idx"
  ON "pairing_attempts" ("user_id", "created_at");
