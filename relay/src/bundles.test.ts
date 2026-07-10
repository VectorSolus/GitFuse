import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { app } from "./index";

type RegisteredDevice = {
  token: string;
  deviceId: string;
};

type RelayRepositoryBody = {
  repository: {
    id: string;
    relayEntryId: string;
  };
};

type BundleUploadBody = {
  bundle: {
    id: string;
    deviceId: string;
  };
};

type BundleListBody = {
  bundles: Array<{
    id: string;
    deviceId: string;
  }>;
};

describe("bundle routes", () => {
  it("lists bundles across devices for one relay entry without crossing accounts or relay entries", async () => {
    const username = `bundle-${randomUUID()}`;
    const email = `${username}@example.com`;
    const first = await registerRelayDevice(username, email, "first");
    const second = await registerRelayDevice(username, email, "second");

    const repo = await createRelayRepository(first.token, `${username}-root-main`, `${username}-repo-main`);
    const uploaded = await uploadRelayBundle(second.token, repo.relayEntryId, "same-account-device-2");

    const sameAccountList = await app.request(`/v1/bundles/${repo.relayEntryId}`, {
      headers: { authorization: `Bearer ${first.token}` }
    });
    expect(sameAccountList.status).toBe(200);
    const sameAccountBody = await sameAccountList.json() as BundleListBody;
    expect(sameAccountBody.bundles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: uploaded.id,
          deviceId: second.deviceId
        })
      ])
    );

    const otherRepo = await createRelayRepository(first.token, `${username}-root-other`, `${username}-repo-other`);
    const otherEntryUpload = await uploadRelayBundle(first.token, otherRepo.relayEntryId, "same-account-other-entry");
    const mainEntryList = await app.request(`/v1/bundles/${repo.relayEntryId}`, {
      headers: { authorization: `Bearer ${first.token}` }
    });
    expect(mainEntryList.status).toBe(200);
    const mainEntryBody = await mainEntryList.json() as BundleListBody;
    expect(mainEntryBody.bundles.map((bundle) => bundle.id)).toContain(uploaded.id);
    expect(mainEntryBody.bundles.map((bundle) => bundle.id)).not.toContain(otherEntryUpload.id);

    const outsider = await registerRelayDevice(`outsider-${randomUUID()}`, `outsider-${randomUUID()}@example.com`, "only");
    const outsiderList = await app.request(`/v1/bundles/${repo.relayEntryId}`, {
      headers: { authorization: `Bearer ${outsider.token}` }
    });
    expect(outsiderList.status).toBe(404);

    const outsiderDownload = await app.request(`/v1/bundles/${uploaded.id}/download`, {
      headers: { authorization: `Bearer ${outsider.token}` }
    });
    expect(outsiderDownload.status).toBe(404);
  });
});

async function registerRelayDevice(username: string, email: string, label: string): Promise<RegisteredDevice> {
  const code = `BND-${label}-${randomUUID()}`;
  const deviceId = randomUUID();
  const deviceResponse = await app.request("/v1/auth/device", {
    method: "POST",
    body: JSON.stringify({
      code,
      deviceName: `${username}-${label}`,
      deviceId
    }),
    headers: { "content-type": "application/json" }
  });
  expect(deviceResponse.status).toBe(201);

  const approveResponse = await app.request("/v1/auth/approve", {
    method: "POST",
    body: JSON.stringify({
      code,
      githubUsername: username,
      email,
      deviceId
    }),
    headers: { "content-type": "application/json" }
  });
  expect(approveResponse.status).toBe(200);

  const pollResponse = await app.request(`/v1/auth/poll/${code}`);
  expect(pollResponse.status).toBe(200);
  const body = await pollResponse.json() as Partial<RegisteredDevice>;
  expect(body.token).toBeTruthy();
  expect(body.deviceId).toBe(deviceId);
  return { token: body.token ?? "", deviceId };
}

async function createRelayRepository(token: string, rootSha: string, displayName: string) {
  const response = await app.request("/v1/repos", {
    method: "POST",
    body: JSON.stringify({ rootSha, displayName }),
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json"
    }
  });
  expect(response.status).toBe(201);
  const body = await response.json() as RelayRepositoryBody;
  return body.repository;
}

async function uploadRelayBundle(token: string, relayEntryId: string, payloadText: string) {
  const payload = new TextEncoder().encode(payloadText);
  const form = new FormData();
  form.set("relayEntryId", relayEntryId);
  form.set("bundleHash", `hash-${randomUUID()}`);
  form.set("commitCount", "1");
  form.set("sizeBytes", String(payload.byteLength));
  form.set("bundle", new File([payload], "bundle.bundle.enc", { type: "application/octet-stream" }));

  const response = await app.request("/v1/bundles/upload", {
    method: "POST",
    body: form,
    headers: { authorization: `Bearer ${token}` }
  });
  expect(response.status).toBe(201);
  const body = await response.json() as BundleUploadBody;
  return body.bundle;
}
