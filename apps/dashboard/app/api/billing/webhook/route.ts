import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

import { applyStripeSubscription } from "../../../../lib/billing";

type StripeSubscriptionPayload = {
  type?: string;
  data?: {
    object?: {
      id?: string;
      customer?: string;
      current_period_end?: number;
      items?: { data?: Array<{ price?: { id?: string } }> };
    };
  };
};

function verifyStripeSignature(payload: string, signatureHeader: string | null) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return true;
  if (!signatureHeader) return false;

  const timestamp = signatureHeader.split(",").find((part) => part.startsWith("t="))?.slice(2);
  const signature = signatureHeader.split(",").find((part) => part.startsWith("v1="))?.slice(3);
  if (!timestamp || !signature) return false;

  const expected = createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex");
  const actualBuffer = Buffer.from(signature, "hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

export async function POST(request: Request) {
  const payload = await request.text();
  if (!verifyStripeSignature(payload, request.headers.get("stripe-signature"))) {
    return NextResponse.json({ error: "invalid_signature" }, { status: 400 });
  }

  const event = JSON.parse(payload) as StripeSubscriptionPayload;
  if (event.type === "customer.subscription.created" || event.type === "customer.subscription.updated") {
    const subscription = event.data?.object;
    if (subscription?.customer && subscription.id) {
      await applyStripeSubscription({
        stripeCustomerId: subscription.customer,
        stripeSubId: subscription.id,
        priceId: subscription.items?.data?.[0]?.price?.id,
        currentPeriodEnd: subscription.current_period_end
      });
    }
  }

  return NextResponse.json({ received: true });
}
