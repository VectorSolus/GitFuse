import { NextResponse } from "next/server";

import { requestCliOtpFallback } from "@/lib/pairing-pin";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    email?: unknown;
  } | null;

  const result = await requestCliOtpFallback(String(body?.email ?? ""));

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      { status: result.error === "delivery_failed" ? 502 : 400 },
    );
  }

  return NextResponse.json({ sent: true });
}
