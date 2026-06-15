import { NextResponse } from "next/server";

import {
  syncRazorpaySubscriptionEvent,
  verifyRazorpayWebhookSignature,
  type RazorpayWebhookEvent,
} from "../../../../lib/billing";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-razorpay-signature");

  if (!verifyRazorpayWebhookSignature(rawBody, signature)) {
    return NextResponse.json(
      { error: "invalid_signature" },
      { status: 400 },
    );
  }

  try {
    const event = JSON.parse(rawBody) as RazorpayWebhookEvent;
    await syncRazorpaySubscriptionEvent(event);
    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("[billing:webhook]", error);
    return NextResponse.json(
      { error: "webhook_processing_failed" },
      { status: 500 },
    );
  }
}
