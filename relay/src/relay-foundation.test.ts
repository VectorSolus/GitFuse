import { describe, expect, it } from "vitest";
import { app } from "./index";
import { SESSION_EXPIRED } from "./errors/responses";

describe("relay-foundation", () => {
  it("returns health status", async () => {
    const response = await app.request("/health");
    await expect(response.json()).resolves.toEqual({ ok: true, service: "gitfuse-relay" });
  });

  it("returns exact session-expired error when bearer token is missing", async () => {
    const response = await app.request("/v1/repos");

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual(SESSION_EXPIRED);
  });

  it("returns exact session-expired error when bearer token is invalid", async () => {
    const response = await app.request("/v1/repos", {
      headers: { authorization: "Bearer invalid-token-task004" }
    });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual(SESSION_EXPIRED);
  });
});
