ALTER TABLE "plans" ADD COLUMN "payment_provider" text;
ALTER TABLE "plans" ADD COLUMN "razorpay_customer_id" text;
ALTER TABLE "plans" ADD COLUMN "razorpay_subscription_id" text;
ALTER TABLE "plans" ADD COLUMN "razorpay_plan_id" text;
ALTER TABLE "plans" ADD COLUMN "requested_tier" "plan_tier" DEFAULT 'free' NOT NULL;
ALTER TABLE "plans" ADD COLUMN "subscription_status" text;
ALTER TABLE "plans" ADD COLUMN "current_period_start" timestamp with time zone;
ALTER TABLE "plans" ADD COLUMN "cancel_at_period_end" boolean DEFAULT false NOT NULL;

UPDATE "plans"
SET "requested_tier" = "tier";

ALTER TABLE "plans"
ADD CONSTRAINT "plans_razorpay_subscription_id_unique"
UNIQUE ("razorpay_subscription_id");
