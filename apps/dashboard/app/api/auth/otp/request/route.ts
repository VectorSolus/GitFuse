import { NextResponse } from "next/server";

import { findDashboardAccountByEmail } from "../../../../../lib/account";
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
  const purpose = "sign_in_email";

  if (!isValidEmail(email)) {
    return NextResponse.json({ error: "INVALID_EMAIL" }, { status: 400 });
  }

  if (password.length < 8) {
    return NextResponse.json({ error: "PASSWORD_TOO_SHORT" }, { status: 400 });
  }

  try {
    const user = await findDashboardAccountByEmail(email);

    if (user?.password_hash) {
      return NextResponse.json({
        ok: true,
        next: "password_signin_available",
      });
    }

    const code = await createOtp(user?.id ?? null, email, purpose);
    await sendOtpEmail(email, code, purpose);
  } catch (error) {
    console.error("[otp-request]", error);
    return NextResponse.json(
      { error: "EMAIL_DELIVERY_FAILED" },
      { status: 502 },
    );
  }

  return NextResponse.json({
    ok: true,
    next: "otp_required",
    sent: true,
    expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString()
  });
}
