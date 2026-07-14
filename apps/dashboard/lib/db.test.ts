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

function resetDashboardDatabaseGlobal() {
  const databaseGlobal = globalThis as typeof globalThis & {
    __gitfuseDashboardSql?: unknown;
    __gitfuseDashboardSqlDatabaseUrl?: string;
  };
  delete databaseGlobal.__gitfuseDashboardSql;
  delete databaseGlobal.__gitfuseDashboardSqlDatabaseUrl;
}

async function closeCurrentDashboardSql() {
  const { closeDashboardSqlForTest } = await import("./db");
  await closeDashboardSqlForTest();
}

beforeEach(() => {
  vi.resetModules();
  vi.unstubAllEnvs();
  vi.stubEnv("DATABASE_URL", "postgres://dashboard.example/gitfuse");
  vi.stubEnv("NODE_ENV", "test");
  resetDashboardDatabaseGlobal();
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
  await closeCurrentDashboardSql();
  resetDashboardDatabaseGlobal();
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("dashboard database client", () => {
  it("uses conservative pool defaults and reuses the module-level client", async () => {
    const { getSql } = await import("./db");

    expect(getSql()).toBe(getSql());
    expect(postgresState.constructor).toHaveBeenCalledTimes(1);
    expect(postgresState.constructor).toHaveBeenCalledWith(
      "postgres://dashboard.example/gitfuse",
      {
        max: 4,
        idle_timeout: 20,
        connect_timeout: 10,
        max_lifetime: 1800,
        prepare: false,
      },
    );
  });

  it("honors explicit database pool environment variables", async () => {
    vi.stubEnv("DATABASE_POOL_MAX", "2");
    vi.stubEnv("DATABASE_IDLE_TIMEOUT", "7");
    vi.stubEnv("DATABASE_CONNECT_TIMEOUT", "3");
    vi.stubEnv("DATABASE_MAX_LIFETIME", "120");

    const { getSql } = await import("./db");
    getSql();

    expect(postgresState.constructor).toHaveBeenCalledWith(
      "postgres://dashboard.example/gitfuse",
      {
        max: 2,
        idle_timeout: 7,
        connect_timeout: 3,
        max_lifetime: 120,
        prepare: false,
      },
    );
  });

  it("reuses the development global client across module reloads", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const firstModule = await import("./db");
    const firstSql = firstModule.getSql();

    vi.resetModules();
    const secondModule = await import("./db");
    const secondSql = secondModule.getSql();

    expect(secondSql).toBe(firstSql);
    expect(postgresState.constructor).toHaveBeenCalledTimes(1);
  });

  it("creates one production module-level client per module instance", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const { getSql } = await import("./db");

    expect(getSql()).toBe(getSql());
    expect(postgresState.constructor).toHaveBeenCalledTimes(1);
  });

  it("reuses one client for repeated account and provider lookups", async () => {
    const {
      findDashboardAccountById,
      findDashboardAccountByProviderIdentity,
    } = await import("./account");

    for (let index = 0; index < 25; index += 1) {
      await findDashboardAccountById(`user-${index}`);
      await findDashboardAccountByProviderIdentity("google", `google-${index}`);
    }

    expect(postgresState.constructor).toHaveBeenCalledTimes(1);
    expect(postgresState.instances[0]).toHaveBeenCalledTimes(50);
  });

  it("shares one client across dashboard data modules", async () => {
    const { getDashboardAccountLimits } = await import("./account-limits");
    const { listDashboardDevices, countPendingDashboardDeviceApprovals } =
      await import("./devices");
    const { listDashboardSyncHistory } = await import("./history");
    const { getDashboardUsage } = await import("./usage");

    await getDashboardAccountLimits({ id: "account-id" });
    await listDashboardDevices({ email: "owner@example.com" });
    await countPendingDashboardDeviceApprovals("account-id");
    await listDashboardSyncHistory({ email: "owner@example.com" });
    await getDashboardUsage({ email: "owner@example.com" });

    expect(postgresState.constructor).toHaveBeenCalledTimes(1);
  });

  it("closes and resets test clients only through explicit test teardown", async () => {
    const { closeDashboardSqlForTest, getSql } = await import("./db");
    const firstSql = getSql();

    await closeDashboardSqlForTest();
    expect(firstSql.end).toHaveBeenCalledWith({ timeout: 5 });

    const secondSql = getSql();
    expect(secondSql).not.toBe(firstSql);
    expect(postgresState.constructor).toHaveBeenCalledTimes(2);
  });
});
