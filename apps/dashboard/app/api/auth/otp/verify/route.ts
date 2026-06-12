import { NextResponse } from "next/server";

import { isValidEmail, normalizeEmail, verifyOtp } from "../../../../../lib/otp";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    email?: unknown;
    code?: unknown;
    purpose?: unknown;
  } | null;

  const email = normalizeEmail(String(body?.email ?? ""));
  const code = String(body?.code ?? "");
  const purpose = body?.purpose === "add_email" ? "add_email" : "sign_in_email";

  if (!isValidEmail(email)) {
    return NextResponse.json({ error: "INVALID_EMAIL" }, { status: 400 });
  }

  const verified = await verifyOtp(null, email, code, purpose);

  if (!verified) {
    return NextResponse.json({ error: "INVALID_OTP" }, { status: 400 });
  }

  return NextResponse.json({ verified: true });
}
