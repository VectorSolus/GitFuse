import { NextResponse } from "next/server";

import { findDashboardAccountByEmail } from "@/lib/account";
import {
  isValidEmail,
  normalizeEmail,
} from "@/lib/otp";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    email?: unknown;
  } | null;
  const email = normalizeEmail(String(body?.email ?? ""));

  if (!isValidEmail(email)) {
    return NextResponse.json(
      { error: "INVALID_EMAIL", message: "Enter a valid email address." },
      { status: 400 },
    );
  }

  try {
    const user = await findDashboardAccountByEmail(email);

    return NextResponse.json({
      ok: true,
      exists: Boolean(user),
      hasPassword: Boolean(user?.password_hash),
      emailVerified: Boolean(user?.email_verified_at),
    });
  } catch (error) {
    console.error("[account-status]", error);
    return NextResponse.json(
      {
        error: "ACCOUNT_STATUS_UNAVAILABLE",
        message: "Could not check this account. Please try again.",
      },
      { status: 500 },
    );
  }
}
