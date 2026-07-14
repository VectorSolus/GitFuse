import { NextResponse } from "next/server";

import { findDashboardAccountForSession } from "../../../../../../lib/account";
import { auth } from "../../../../../../lib/auth";
import {
  isCompleteDeviceUuid,
  revokeDashboardDevice,
} from "../../../../../../lib/devices";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: {
    deviceId: string;
  };
};

function jsonError(error: string, message: string, status: number) {
  return NextResponse.json({ ok: false, error, message }, { status });
}

export async function POST(_request: Request, context: RouteContext) {
  const session = await auth().catch((error) => {
    console.error("[api:dashboard:devices:revoke:auth]", error);
    return "auth_unavailable" as const;
  });

  if (session === "auth_unavailable") {
    return jsonError("DEVICE_REVOKE_FAILED", "Could not revoke this device.", 503);
  }

  if (!session?.user) {
    return jsonError("UNAUTHENTICATED", "Sign in is required.", 401);
  }

  if (session.invalid) {
    return jsonError("SESSION_EXPIRED", "Your session expired. Please sign in again.", 401);
  }

  const deviceId = context.params.deviceId;
  if (!isCompleteDeviceUuid(deviceId)) {
    return jsonError("INVALID_DEVICE_ID", "A complete device UUID is required.", 400);
  }

  const databaseUser = await findDashboardAccountForSession({
    id: session.user.id,
    email: session.user.email,
  }).catch((error) => {
    console.error("[api:dashboard:devices:revoke:account]", error);
    return "account_unavailable" as const;
  });

  if (databaseUser === "account_unavailable") {
    return jsonError("DEVICE_REVOKE_FAILED", "Could not revoke this device.", 503);
  }

  if (!databaseUser) {
    return jsonError("SESSION_EXPIRED", "Your session expired. Please sign in again.", 401);
  }

  try {
    const result = await revokeDashboardDevice(
      {
        id: databaseUser.id,
        email: databaseUser.email,
        username: databaseUser.github_username,
      },
      deviceId,
    );

    if (!result.ok) {
      const status = result.error === "INVALID_DEVICE_ID" ? 400 : 404;
      return jsonError(result.error, result.message, status);
    }

    return NextResponse.json(result, {
      headers: {
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    console.error("[api:dashboard:devices:revoke]", error);
    return jsonError("DEVICE_REVOKE_FAILED", "Could not revoke this device.", 500);
  }
}
