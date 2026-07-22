import { describe, expect, it } from "vitest";
import { app } from "./index";
import { setAccountTierByIdentityForTest } from "./db/queries";

async function registerDevice(input: {
  username: string;
  email: string;
  code: string;
  deviceId: string;
  deviceName?: string;
}) {
  await app.request("/v1/auth/device", {
    method: "POST",
    body: JSON.stringify({
      code: input.code,
      deviceName: input.deviceName ?? input.deviceId,
      deviceId: input.deviceId
    }),
    headers: { "content-type": "application/json" }
  });

  return app.request("/v1/auth/approve", {
    method: "POST",
    body: JSON.stringify({
      code: input.code,
      githubUsername: input.username,
      email: input.email,
      deviceId: input.deviceId
    }),
    headers: { "content-type": "application/json" }
  });
}

async function pollToken(code: string) {
  const response = await app.request(`/v1/auth/poll/${code}`);
  const body = await response.json() as { token?: string; deviceId?: string };
  return body;
}

describe("TestDeviceLimit", () => {
  it("keeps devices with duplicate hostnames separate by immutable device ID", async () => {
    const username = `duplicate-device-${Date.now()}`;
    const email = `${username}@example.com`;
    const hostname = "Piyushs-MacBook-Pro.local";
    const firstDeviceId = "00000000-0000-4000-8000-000000000201";
    const secondDeviceId = "00000000-0000-4000-8000-000000000202";

    await expect(
      registerDevice({
        username,
        email,
        code: "DUP201",
        deviceId: firstDeviceId,
        deviceName: hostname
      })
    ).resolves.toHaveProperty("status", 200);
    await expect(
      registerDevice({
        username,
        email,
        code: "DUP202",
        deviceId: secondDeviceId,
        deviceName: hostname
      })
    ).resolves.toHaveProperty("status", 200);
    await expect(
      registerDevice({
        username,
        email,
        code: "DUP203",
        deviceId: firstDeviceId,
        deviceName: hostname
      })
    ).resolves.toHaveProperty("status", 200);

    const current = await pollToken("DUP203");
    const devicesResponse = await app.request("/v1/devices", {
      headers: { authorization: `Bearer ${current.token}` }
    });
    expect(devicesResponse.status).toBe(200);
    const devicesBody = await devicesResponse.json() as {
      devices: Array<{ id: string; name: string; revokedAt: string | null }>;
    };
    const activeSameNameDevices = devicesBody.devices.filter(
      (device) => device.name === hostname && device.revokedAt === null
    );

    expect(activeSameNameDevices.map((device) => device.id).sort()).toEqual([
      firstDeviceId,
      secondDeviceId
    ]);

    const limitsResponse = await app.request("/v1/account/limits", {
      headers: { authorization: `Bearer ${current.token}` }
    });
    expect(limitsResponse.status).toBe(200);
    await expect(limitsResponse.json()).resolves.toMatchObject({
      devices: { limit: 2, current: 2 }
    });
  });

  it("revokes by full UUID, preserves history, and invalidates the revoked token", async () => {
    const username = `revoke-device-${Date.now()}`;
    const email = `${username}@example.com`;
    const hostname = "Piyushs-MacBook-Pro.local";
    const firstDeviceId = "00000000-0000-4000-8000-000000000211";
    const secondDeviceId = "00000000-0000-4000-8000-000000000212";

    await expect(
      registerDevice({
        username,
        email,
        code: "REV211",
        deviceId: firstDeviceId,
        deviceName: hostname
      })
    ).resolves.toHaveProperty("status", 200);
    await expect(
      registerDevice({
        username,
        email,
        code: "REV212",
        deviceId: secondDeviceId,
        deviceName: hostname
      })
    ).resolves.toHaveProperty("status", 200);

    const first = await pollToken("REV211");
    const second = await pollToken("REV212");

    const revokeResponse = await app.request(`/v1/devices/${firstDeviceId}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${second.token}` }
    });
    expect(revokeResponse.status).toBe(200);
    await expect(revokeResponse.json()).resolves.toEqual({ revoked: true });

    const repeatRevokeResponse = await app.request(`/v1/devices/${firstDeviceId}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${second.token}` }
    });
    expect(repeatRevokeResponse.status).toBe(200);

    const devicesResponse = await app.request("/v1/devices", {
      headers: { authorization: `Bearer ${second.token}` }
    });
    expect(devicesResponse.status).toBe(200);
    const devicesBody = await devicesResponse.json() as {
      devices: Array<{ id: string; name: string; revokedAt: string | null }>;
    };
    expect(devicesBody.devices).toHaveLength(2);
    expect(devicesBody.devices.find((device) => device.id === firstDeviceId)).toMatchObject({
      id: firstDeviceId,
      name: hostname
    });
    expect(devicesBody.devices.find((device) => device.id === firstDeviceId)?.revokedAt).toBeTruthy();
    expect(devicesBody.devices.find((device) => device.id === secondDeviceId)?.revokedAt).toBeNull();

    const limitsResponse = await app.request("/v1/account/limits", {
      headers: { authorization: `Bearer ${second.token}` }
    });
    expect(limitsResponse.status).toBe(200);
    await expect(limitsResponse.json()).resolves.toMatchObject({
      devices: { limit: 2, current: 1 }
    });

    const revokedTokenResponse = await app.request("/v1/devices", {
      headers: { authorization: `Bearer ${first.token}` }
    });
    expect(revokedTokenResponse.status).toBe(401);
  });

  it("allows 2 free devices, rejects the 3rd, then allows it after paid upgrade", async () => {
    const username = `limit-${Date.now()}`;
    const email = `${username}@example.com`;

    await expect(registerDevice({ username, email, code: "LIM101", deviceId: "00000000-0000-4000-8000-000000000101" }))
      .resolves.toHaveProperty("status", 200);
    await expect(registerDevice({ username, email, code: "LIM102", deviceId: "00000000-0000-4000-8000-000000000102" }))
      .resolves.toHaveProperty("status", 200);

    const third = await registerDevice({
      username,
      email,
      code: "LIM103",
      deviceId: "00000000-0000-4000-8000-000000000103"
    });
    expect(third.status).toBe(403);
    await expect(third.json()).resolves.toEqual({
      error: "device_limit_reached",
      tier: "free",
      limit: 2,
      current: 2
    });

    const invalidApproval = await app.request("/v1/auth/approve", {
      method: "POST",
      body: JSON.stringify({
        code: "LIM404",
        githubUsername: username,
        email
      }),
      headers: { "content-type": "application/json" }
    });
    expect(invalidApproval.status).toBe(404);

    const first = await pollToken("LIM101");
    const limitsBefore = await app.request("/v1/account/limits", {
      headers: { authorization: `Bearer ${first.token}` }
    });
    expect(limitsBefore.status).toBe(200);
    await expect(limitsBefore.json()).resolves.toEqual({
      tier: "free",
      devices: { limit: 2, current: 2 },
      retention_days: 7
    });

    await expect(setAccountTierByIdentityForTest(username, email, "paid")).resolves.toBe(true);

    const thirdAfterUpgrade = await registerDevice({
      username,
      email,
      code: "LIM104",
      deviceId: "00000000-0000-4000-8000-000000000103"
    });
    expect(thirdAfterUpgrade.status).toBe(200);

    const limitsAfter = await app.request("/v1/account/limits", {
      headers: { authorization: `Bearer ${first.token}` }
    });
    expect(limitsAfter.status).toBe(200);
    await expect(limitsAfter.json()).resolves.toEqual({
      tier: "paid",
      devices: { limit: null, current: 3 },
      retention_days: 365
    });
  });
});
