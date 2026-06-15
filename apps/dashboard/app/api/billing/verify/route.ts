import { NextResponse } from "next/server";

import { auth } from "../../../../lib/auth";
import {
  verifyRazorpayCheckoutSignature,
  verifyRazorpaySubscriptionOwnership,
} from "../../../../lib/billing";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const session = await auth().catch(() => null);
  if (!session?.user?.id || session.invalid) {
    return NextResponse.json(
      { error: "not_authenticated" },
      { status: 401 },
    );
  }

  const body = (await request.json().catch(() => null)) as
    | {
        razorpay_payment_id?: string;
        razorpay_subscription_id?: string;
        razorpay_signature?: string;
      }
    | null;
  const paymentId = body?.razorpay_payment_id?.trim();
  const subscriptionId = body?.razorpay_subscription_id?.trim();
  const signature = body?.razorpay_signature?.trim();

  if (!paymentId || !subscriptionId || !signature) {
    return NextResponse.json(
      { error: "invalid_checkout_response" },
      { status: 400 },
    );
  }

  const ownsSubscription = await verifyRazorpaySubscriptionOwnership(
    session.user.id,
    subscriptionId,
  );
  const validSignature =
    ownsSubscription &&
    verifyRazorpayCheckoutSignature({
      paymentId,
      subscriptionId,
      signature,
    });

  if (!validSignature) {
    return NextResponse.json(
      { error: "invalid_signature" },
      { status: 400 },
    );
  }

  return NextResponse.json({
    ok: true,
    message: "Payment authorization verified. Plan activation is pending webhook confirmation.",
  });
}
