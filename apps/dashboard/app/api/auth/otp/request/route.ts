import { NextResponse } from "next/server";

import { createOtp, isValidEmail, normalizeEmail, sendOtpEmail } from "../../../../../lib/otp";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    email?: unknown;
    password?: unknown;
    purpose?: unknown;
  } | null;

  const email = normalizeEmail(String(body?.email ?? ""));
  const password = String(body?.password ?? "");
  const purpose = body?.purpose === "add_email" ? "add_email" : "sign_in_email";

  if (!isValidEmail(email)) {
    return NextResponse.json({ error: "INVALID_EMAIL" }, { status: 400 });
  }

  if (password.length < 8) {
    return NextResponse.json({ error: "PASSWORD_TOO_SHORT" }, { status: 400 });
  }

  const code = await createOtp(null, email, purpose);
  await sendOtpEmail(email, code, purpose);

  return NextResponse.json({
    sent: true,
    expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString()
  });
}
