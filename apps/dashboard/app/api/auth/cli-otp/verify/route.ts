import { NextResponse } from "next/server";

import { verifyCliOtpFallback } from "@/lib/pairing-pin";

export const runtime = "nodejs";

function requestIp(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return (
    forwardedFor ||
    request.headers.get("x-real-ip")?.trim() ||
    request.headers.get("cf-connecting-ip")?.trim() ||
    "unknown"
  );
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    email?: unknown;
    code?: unknown;
    deviceName?: unknown;
    deviceId?: unknown;
  } | null;

  const result = await verifyCliOtpFallback({
    email: String(body?.email ?? ""),
    code: String(body?.code ?? ""),
    deviceName: typeof body?.deviceName === "string" ? body.deviceName : null,
    deviceId: typeof body?.deviceId === "string" ? body.deviceId : null,
    ipAddress: requestIp(request),
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      { status: result.error === "approval_failed" ? 502 : 400 },
    );
  }

  return NextResponse.json({
    token: result.token,
    username: result.username,
    deviceId: result.deviceId,
  });
}
