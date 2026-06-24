import { describe, expect, it } from "vitest";
import { app } from "./index";
import { setAccountTierByIdentityForTest } from "./db/queries";

async function registerDevice(input: {
  username: string;
  email: string;
  code: string;
  deviceId: string;
}) {
  await app.request("/v1/auth/device", {
    method: "POST",
    body: JSON.stringify({
      code: input.code,
      deviceName: input.deviceId,
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
      retention_days: null
    });
  });
});
