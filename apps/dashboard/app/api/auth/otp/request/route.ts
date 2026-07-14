import { NextResponse } from "next/server";

import { requestEmailPasswordOtp } from "../../../../../lib/auth-email";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    email?: unknown;
    password?: unknown;
  } | null;

  try {
    const result = await requestEmailPasswordOtp({
      email: String(body?.email ?? ""),
      password: String(body?.password ?? ""),
    });

    if (!result.ok) {
      const status = result.error === "EMAIL_DELIVERY_FAILED" ? 502 : 400;
      const message =
        result.error === "INVALID_EMAIL"
          ? "Enter a valid email address."
          : result.error === "PASSWORD_TOO_SHORT"
            ? "Password must be at least 8 characters."
            : "Could not send verification code.";

      return NextResponse.json(
        { error: result.error, message },
        { status },
      );
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("[otp-request]", error);
    return NextResponse.json(
      { error: "EMAIL_DELIVERY_FAILED" },
      { status: 502 },
    );
  }
}
