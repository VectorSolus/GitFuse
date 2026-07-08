import { describe, expect, it } from "vitest";
import { app, createRelayApp } from "./index";
import { SESSION_EXPIRED } from "./errors/responses";

describe("relay-foundation", () => {
  it("returns health status", async () => {
    const response = await app.request("/health");

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    await expect(response.json()).resolves.toEqual({
      status: "ok",
      version: "dev",
      commit: "unknown",
    });
  });

  it("returns readiness success when dependencies are available", async () => {
    const readyApp = createRelayApp({
      readinessCheck: async () => ({ ok: true }),
    });
    const response = await readyApp.request("/ready");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "ready" });
  });

  it("returns readiness failure when the database is unavailable", async () => {
    const readyApp = createRelayApp({
      readinessCheck: async () => ({ ok: false, reason: "database_unreachable" }),
    });
    const response = await readyApp.request("/ready");

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      status: "not_ready",
      reason: "database_unreachable",
    });
  });

  it("does not leak secrets from readiness failures", async () => {
    const readyApp = createRelayApp({
      readinessCheck: async () => ({ ok: false, reason: "database_timeout" }),
    });
    const response = await readyApp.request("/ready");
    const body = await response.text();

    expect(body).toContain("database_timeout");
    expect(body).not.toContain("postgres://");
    expect(body).not.toContain("password");
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
