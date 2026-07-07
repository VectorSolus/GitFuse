import { beforeEach, describe, expect, it, vi } from "vitest";

const routeState = vi.hoisted(() => ({
  session: null as unknown,
  account: null as unknown,
  revokeResult: null as unknown,
  revokeError: null as unknown,
  revokeCalls: [] as Array<{ account: unknown; deviceId: string }>,
}));

vi.mock("./lib/auth", () => ({
  auth: vi.fn(async () => routeState.session),
}));

vi.mock("./lib/account", () => ({
  findDashboardAccountForSession: vi.fn(async () => routeState.account),
}));

vi.mock("./lib/devices", async () => {
  const actual = await vi.importActual<typeof import("./lib/devices")>("./lib/devices");
  return {
    ...actual,
    revokeDashboardDevice: vi.fn(async (account: unknown, deviceId: string) => {
      routeState.revokeCalls.push({ account, deviceId });
      if (routeState.revokeError) {
        throw routeState.revokeError;
      }
      return routeState.revokeResult;
    }),
  };
});

import { POST } from "./app/api/dashboard/devices/[deviceId]/revoke/route";

const ownedDeviceId = "00000000-0000-4000-8000-000000000101";

function verifiedSession() {
  return {
    user: {
      id: "session-user",
      email: "owner@example.com",
    },
  };
}

function verifiedAccount() {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    email: "owner@example.com",
    github_username: "owner",
  };
}

async function postRevoke(deviceId = ownedDeviceId) {
  return POST(new Request("http://gitfuse.test/api/dashboard/devices/revoke"), {
    params: { deviceId },
  });
}

describe("dashboard device revoke route", () => {
  beforeEach(() => {
    routeState.session = verifiedSession();
    routeState.account = verifiedAccount();
    routeState.revokeResult = {
      ok: true,
      alreadyRevoked: false,
      device: {
        id: ownedDeviceId,
        revoked: true,
        revokedAt: "2026-06-29T09:00:00.000Z",
      },
    };
    routeState.revokeError = null;
    routeState.revokeCalls = [];
  });

  it("revokes an authenticated active device with the full UUID", async () => {
    const response = await postRevoke();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(routeState.revokeResult);
    expect(routeState.revokeCalls).toEqual([
      {
        account: {
          id: "00000000-0000-4000-8000-000000000001",
          email: "owner@example.com",
          username: "owner",
        },
        deviceId: ownedDeviceId,
      },
    ]);
  });

  it("rejects unauthenticated requests", async () => {
    routeState.session = null;

    const response = await postRevoke();

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: "UNAUTHENTICATED",
    });
    expect(routeState.revokeCalls).toHaveLength(0);
  });

  it("rejects short or malformed UUIDs", async () => {
    const response = await postRevoke("34dc0230");

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "INVALID_DEVICE_ID",
      message: "A complete device UUID is required.",
    });
    expect(routeState.revokeCalls).toHaveLength(0);
  });

  it("does not reveal unknown or cross-account devices", async () => {
    routeState.revokeResult = {
      ok: false,
      error: "DEVICE_NOT_FOUND",
      message: "Device not found.",
    };

    const response = await postRevoke("00000000-0000-4000-8000-000000000999");

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "DEVICE_NOT_FOUND",
      message: "Device not found.",
    });
  });

  it("returns a safe generic response when the database revoke fails", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    routeState.revokeError = new Error('column reference "revoked_at" is ambiguous');

    const response = await postRevoke();
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({
      ok: false,
      error: "DEVICE_REVOKE_FAILED",
      message: "Could not revoke this device.",
    });
    expect(JSON.stringify(body)).not.toContain("revoked_at");
    expect(JSON.stringify(body)).not.toContain("ambiguous");
    expect(errorSpy).toHaveBeenCalledWith(
      "[api:dashboard:devices:revoke]",
      routeState.revokeError,
    );

    errorSpy.mockRestore();
  });

  it("treats already-revoked owned devices as idempotent success", async () => {
    routeState.revokeResult = {
      ok: true,
      alreadyRevoked: true,
      device: {
        id: ownedDeviceId,
        revoked: true,
        revokedAt: "2026-06-29T08:00:00.000Z",
      },
    };

    const response = await postRevoke();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual(routeState.revokeResult);
    expect(JSON.stringify(body)).not.toContain("token");
    expect(JSON.stringify(body)).not.toContain("tokenHash");
  });
});
