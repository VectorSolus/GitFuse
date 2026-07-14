import { NextResponse } from "next/server";

import { pairCliDeviceWithPin } from "@/lib/pairing-pin";

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
    pin?: unknown;
    deviceName?: unknown;
    deviceId?: unknown;
  } | null;

  try {
    const result = await pairCliDeviceWithPin({
      email: String(body?.email ?? ""),
      pin: String(body?.pin ?? ""),
      deviceName: typeof body?.deviceName === "string" ? body.deviceName : null,
      deviceId: typeof body?.deviceId === "string" ? body.deviceId : null,
      ipAddress: requestIp(request),
    });

    if (!result.ok && result.error === "rate_limited") {
      return NextResponse.json(
        {
          error: "rate_limited",
          retry_after_seconds: result.retryAfterSeconds,
        },
        { status: 429 },
      );
    }

    if (!result.ok && result.error === "device_limit_reached") {
      return NextResponse.json(
        {
          error: "device_limit_reached",
          current: result.current,
          limit: result.max,
        },
        { status: 403 },
      );
    }

    if (!result.ok) {
      return NextResponse.json(
        {
          error: "invalid_credentials",
          ...(result.suggestFallback ? { suggest_fallback: true } : {}),
        },
        { status: 401 },
      );
    }

    return NextResponse.json({
      token: result.token,
      username: result.username,
      deviceId: result.deviceId,
    });
  } catch (error) {
    console.error("[cli-pair]", error);
    return NextResponse.json(
      { error: "auth_unavailable" },
      { status: 502 },
    );
  }
}
