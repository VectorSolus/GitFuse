import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const postgresState = vi.hoisted(() => ({
  constructor: vi.fn(),
  instances: [] as Array<
    ((strings: TemplateStringsArray, ...values: unknown[]) => Promise<unknown[]>) & {
      end: ReturnType<typeof vi.fn>;
    }
  >,
}));

vi.mock("postgres", () => ({
  default: postgresState.constructor,
}));

function resetRelayDatabaseGlobal() {
  const databaseGlobal = globalThis as typeof globalThis & {
    __gitfuseRelaySql?: unknown;
    __gitfuseRelaySqlDatabaseUrl?: string;
  };
  delete databaseGlobal.__gitfuseRelaySql;
  delete databaseGlobal.__gitfuseRelaySqlDatabaseUrl;
}

async function closeCurrentRelaySql() {
  const { closeRelaySqlForTest } = await import("./postgres");
  await closeRelaySqlForTest();
}

beforeEach(() => {
  vi.resetModules();
  vi.unstubAllEnvs();
  vi.stubEnv("DATABASE_URL", "postgres://relay.example/gitfuse");
  vi.stubEnv("NODE_ENV", "test");
  resetRelayDatabaseGlobal();
  postgresState.instances = [];
  postgresState.constructor.mockReset();
  postgresState.constructor.mockImplementation(() => {
    const sql = vi.fn(async () => []) as unknown as ((strings: TemplateStringsArray, ...values: unknown[]) => Promise<unknown[]>) & {
      end: ReturnType<typeof vi.fn>;
    };
    sql.end = vi.fn(async () => undefined);
    postgresState.instances.push(sql);
    return sql;
  });
});

afterEach(async () => {
  await closeCurrentRelaySql();
  resetRelayDatabaseGlobal();
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("relay database client", () => {
  it("uses conservative pool defaults and reuses the module-level client", async () => {
    const { getRelaySql } = await import("./postgres");

    expect(getRelaySql()).toBe(getRelaySql());
    expect(postgresState.constructor).toHaveBeenCalledTimes(1);
    expect(postgresState.constructor).toHaveBeenCalledWith(
      "postgres://relay.example/gitfuse",
      {
        max: 4,
        idle_timeout: 20,
        connect_timeout: 10,
        max_lifetime: 1800,
        prepare: false,
      },
    );
  });

  it("returns null without constructing a pool when DATABASE_URL is absent", async () => {
    vi.stubEnv("DATABASE_URL", "");
    const { getRelaySql } = await import("./postgres");

    expect(getRelaySql()).toBeNull();
    expect(postgresState.constructor).not.toHaveBeenCalled();
  });

  it("reports database readiness success", async () => {
    const { checkRelayDatabaseReady } = await import("./postgres");

    await expect(checkRelayDatabaseReady()).resolves.toEqual({ ok: true });
  });

  it("reports readiness failure when the database is not configured", async () => {
    vi.stubEnv("DATABASE_URL", "");
    const { checkRelayDatabaseReady } = await import("./postgres");

    await expect(checkRelayDatabaseReady()).resolves.toEqual({
      ok: false,
      reason: "database_not_configured",
    });
  });

  it("reports readiness failure without leaking connection details", async () => {
    postgresState.constructor.mockImplementation(() => {
      const sql = vi.fn(async () => {
        throw new Error("postgres://secret@example/db");
      }) as unknown as ((strings: TemplateStringsArray, ...values: unknown[]) => Promise<unknown[]>) & {
        end: ReturnType<typeof vi.fn>;
      };
      sql.end = vi.fn(async () => undefined);
      postgresState.instances.push(sql);
      return sql;
    });
    const { checkRelayDatabaseReady } = await import("./postgres");

    await expect(checkRelayDatabaseReady()).resolves.toEqual({
      ok: false,
      reason: "database_unreachable",
    });
  });

  it("reuses the development global client across module reloads", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const firstModule = await import("./postgres");
    const firstSql = firstModule.getRelaySql();

    vi.resetModules();
    const secondModule = await import("./postgres");
    const secondSql = secondModule.getRelaySql();

    expect(secondSql).toBe(firstSql);
    expect(postgresState.constructor).toHaveBeenCalledTimes(1);
  });

  it("closes and resets test clients only through explicit test teardown", async () => {
    const { closeRelaySqlForTest, getRelaySql } = await import("./postgres");
    const firstSql = getRelaySql();

    await closeRelaySqlForTest();
    expect(firstSql?.end).toHaveBeenCalledWith({ timeout: 5 });

    const secondSql = getRelaySql();
    expect(secondSql).not.toBe(firstSql);
    expect(postgresState.constructor).toHaveBeenCalledTimes(2);
  });
});
