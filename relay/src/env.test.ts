import { afterEach, describe, expect, it, vi } from "vitest";
import { applyEnvFile, assertRelayDatabaseConfiguration } from "./env";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("relay environment loading", () => {
  it("loads missing values without overwriting explicit process configuration", () => {
    const target = {
      DATABASE_URL: "postgresql://explicit.example/gitfuse",
    } as NodeJS.ProcessEnv;

    applyEnvFile(
      [
        "DATABASE_URL=postgresql://dashboard.example/gitfuse",
        "GITFUSE_RELAY_URL=http://localhost:8787",
        "QUOTED_VALUE=\"hello world\"",
      ].join("\n"),
      target,
    );

    expect(target.DATABASE_URL).toBe("postgresql://explicit.example/gitfuse");
    expect(target.GITFUSE_RELAY_URL).toBe("http://localhost:8787");
    expect(target.QUOTED_VALUE).toBe("hello world");
  });

  it("allows explicit in-memory relay only outside production", () => {
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("GITFUSE_ALLOW_IN_MEMORY_RELAY", "1");

    expect(() => assertRelayDatabaseConfiguration()).not.toThrow();
  });

  it("rejects in-memory relay fallback in production", () => {
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("GITFUSE_ALLOW_IN_MEMORY_RELAY", "1");

    expect(() => assertRelayDatabaseConfiguration()).toThrow(/DATABASE_URL is required/);
  });
});
