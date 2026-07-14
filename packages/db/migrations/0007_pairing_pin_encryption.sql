ALTER TABLE "users"
ADD COLUMN IF NOT EXISTS "pairing_pin_encrypted" text;
