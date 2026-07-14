import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.DATABASE_URL ??= "postgresql://localhost:5432/gitfuse_db";
  process.env.AUTH_SECRET ??= "test-auth-secret";
  process.env.PAIRING_PIN_ENCRYPTION_KEY ??= "0123456789abcdef0123456789abcdef";
});

import { getSql } from "./lib/db";
import { createOtp } from "./lib/otp";
import {
  getPairingSecuritySummary,
  pairCliDeviceWithPin,
  revealPairingPinWithOtp,
  setPairingPin,
  type PairingTokenResponse,
} from "./lib/pairing-pin";
import type { TransactionalEmailInput } from "./lib/email";

const baseEmails = [
  "cli-pair-success@example.com",
  "cli-pair-fallback@example.com",
  "cli-pair-shape@example.com",
  "missing-cli-pair@example.com",
  "cli-pair-change@example.com",
  "cli-pair-direct-device@example.com",
  "cli-pair-current-pin@example.com",
  "cli-pair-reveal@example.com",
  "cli-pair-first-time@example.com",
  "cli-pair-legacy@example.com",
  "cli-pair-relay-issued@example.com",
];

async function ensurePairingSchema() {
  const sql = getSql();
  await sql`alter table users add column if not exists pairing_pin_hash text`;
  await sql`alter table users add column if not exists pairing_pin_encrypted text`;
  await sql`alter table users add column if not exists pairing_pin_updated_at timestamp with time zone`;
  await sql`
    create table if not exists pairing_attempts (
      id uuid primary key default gen_random_uuid() not null,
      user_id uuid references users(id) on delete cascade,
      email_attempted text not null,
      ip_address text not null,
      device_name text,
      success boolean default false not null,
      created_at timestamp with time zone default now() not null
    )
  `;
  await sql`
    create index if not exists pairing_attempts_email_created_idx
    on pairing_attempts (email_attempted, created_at)
  `;
  await sql`
    create index if not exists pairing_attempts_ip_created_idx
    on pairing_attempts (ip_address, created_at)
  `;
  await sql`
    create index if not exists pairing_attempts_user_created_idx
    on pairing_attempts (user_id, created_at)
  `;
}

async function cleanupEmail(email: string) {
  const sql = getSql();
  const normalized = email.toLowerCase();
  const users = await sql<{ id: string }[]>`
    select id from users where lower(email) = lower(${normalized})
  `;
  const userIds = users.map((user) => user.id);

  await sql`delete from pairing_attempts where email_attempted = ${normalized}`;

  if (userIds.length > 0) {
    await sql`delete from pairing_attempts where user_id in ${sql(userIds)}`;
    await sql`delete from plans where user_id in ${sql(userIds)}`;
    await sql`delete from users where id in ${sql(userIds)}`;
  }
}

async function cleanupThrottleAttempts() {
  const sql = getSql();
  await sql`
    delete from pairing_attempts
    where ip_address = '198.51.100.44'
       or email_attempted like 'cli-pair-throttle-%@example.com'
  `;
}

async function seedPairingUser(email: string, pin: string) {
  const sql = getSql();
  await cleanupEmail(email);
  const [user] = await sql<{ id: string; github_username: string; email: string }[]>`
    insert into users (github_id, github_username, email, email_verified_at)
    values (${`email:${email}`}, ${email.split("@")[0]}, ${email}, now())
    returning id, github_username, email
  `;
  await setPairingPin(user.id, pin);
  return user;
}

function tokenIssuer(token = "gf_test_token") {
  return async (): Promise<PairingTokenResponse> => ({
    token,
    username: "cli-user",
    deviceId: "device-test-id",
  });
}

async function readJson(request: IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}") as Record<string, string>;
}

function writeJson(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

async function startRelayAuthDouble() {
  const sessions = new Map<
    string,
    {
      deviceId: string;
      deviceName: string;
      expiresAt: string;
      token?: string;
      username?: string;
    }
  >();
  const acceptedTokens = new Set<string>();
  const createdSessions: Array<{ code: string; expiresAt: string }> = [];

  const server = createServer((request, response) => {
    void (async () => {
      const url = new URL(request.url ?? "/", "http://relay.test");

      if (request.method === "POST" && url.pathname === "/v1/auth/device") {
        const body = await readJson(request);
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
        sessions.set(body.code, {
          deviceId: body.deviceId,
          deviceName: body.deviceName,
          expiresAt,
        });
        createdSessions.push({ code: body.code, expiresAt });
        writeJson(response, 201, { code: body.code, expiresAt });
        return;
      }

      if (request.method === "POST" && url.pathname === "/v1/auth/approve") {
        const body = await readJson(request);
        const session = sessions.get(body.code);
        if (!session) {
          writeJson(response, 404, { error: "NOT_FOUND" });
          return;
        }
        const token = `gf_relay_${body.code.replaceAll("-", "").slice(0, 12)}`;
        session.token = token;
        session.username = body.githubUsername;
        acceptedTokens.add(token);
        writeJson(response, 200, { approved: true });
        return;
      }

      if (request.method === "GET" && url.pathname.startsWith("/v1/auth/poll/")) {
        const code = decodeURIComponent(url.pathname.split("/").pop() ?? "");
        const session = sessions.get(code);
        if (!session?.token || !session.username) {
          writeJson(response, 200, { approved: false });
          return;
        }
        writeJson(response, 200, {
          approved: true,
          token: session.token,
          username: session.username,
          deviceId: session.deviceId,
        });
        return;
      }

      if (request.method === "POST" && url.pathname === "/v1/repos") {
        const token = request.headers.authorization?.replace(/^Bearer\s+/i, "");
        if (!token || !acceptedTokens.has(token)) {
          writeJson(response, 401, { error: "SESSION_EXPIRED" });
          return;
        }
        writeJson(response, 201, {
          repository: {
            id: "repo-id",
            relayEntryId: "relay-entry",
            remoteUrl: null,
          },
        });
        return;
      }

      writeJson(response, 404, { error: "NOT_FOUND" });
    })().catch((error) => {
      writeJson(response, 500, {
        error: "TEST_RELAY_ERROR",
        message: error instanceof Error ? error.message : String(error),
      });
    });
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${address.port}`,
    createdSessions,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}

async function attemptCount(email: string, success: boolean) {
  const sql = getSql();
  const [row] = await sql<{ count: string | number }[]>`
    select count(*)::int as count
    from pairing_attempts
    where email_attempted = ${email.toLowerCase()}
      and success = ${success}
  `;

  return Number(row?.count ?? 0);
}

beforeAll(async () => {
  await ensurePairingSchema();
});

beforeEach(async () => {
  await Promise.all(baseEmails.map(cleanupEmail));
  await cleanupThrottleAttempts();
});

afterAll(async () => {
  await Promise.all(baseEmails.map(cleanupEmail));
  await cleanupThrottleAttempts();
});

describe("CLI pairing PIN auth", () => {
  it("records a successful PIN-paired device in the pairing audit log", async () => {
    const email = "cli-pair-direct-device@example.com";
    const user = await seedPairingUser(email, "Pairing123");
    const deviceId = "00000000-0000-4000-8000-000000059001";

    const result = await pairCliDeviceWithPin({
      email,
      pin: "Pairing123",
      ipAddress: "203.0.113.20",
      deviceName: "Direct DB Mac",
      deviceId,
      issueToken: tokenIssuer("gf_direct_device"),
      sendNotification: async () => undefined,
    });

    expect(result).toMatchObject({
      ok: true,
      token: "gf_direct_device",
      username: "cli-user",
    });

    await expect(getPairingSecuritySummary(user.id)).resolves.toMatchObject({
      pairingEvents: [
        {
          ipAddress: "203.0.113.20",
          deviceName: "Direct DB Mac",
        },
      ],
    });
  });

  it("issues PIN-paired device tokens through the relay auth issuer and accepts them immediately", async () => {
    const email = "cli-pair-relay-issued@example.com";
    const user = await seedPairingUser(email, "Pairing123");
    const deviceId = "00000000-0000-4000-8000-000000059061";
    const relay = await startRelayAuthDouble();
    const previousRelayUrl = process.env.GITFUSE_RELAY_URL;
    process.env.GITFUSE_RELAY_URL = relay.url;

    try {
      const result = await pairCliDeviceWithPin({
        email,
        pin: "Pairing123",
        ipAddress: "203.0.113.61",
        deviceName: "Relay Issued Mac",
        deviceId,
        sendNotification: async () => undefined,
      });

      expect(result).toMatchObject({
        ok: true,
        username: user.github_username,
        deviceId,
      });
      if (!result.ok) throw new Error("pairing failed");

      expect(relay.createdSessions).toHaveLength(1);
      const authSessionExpiresAt = result.authSessionExpiresAt;
      expect(authSessionExpiresAt).toBe(relay.createdSessions[0].expiresAt);
      if (!authSessionExpiresAt) throw new Error("missing auth session expiry");
      const secondsUntilExpiry = Math.floor(
        (new Date(authSessionExpiresAt).getTime() - Date.now()) / 1000,
      );
      expect(secondsUntilExpiry).toBeGreaterThan(9 * 60);
      expect(secondsUntilExpiry).toBeLessThanOrEqual(10 * 60);

      const repoResponse = await fetch(`${relay.url}/v1/repos`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${result.token}`,
        },
        body: JSON.stringify({
          rootSha: "relay-issued-root",
          displayName: "relay-issued",
          remoteUrl: "",
        }),
      });

      expect(repoResponse.status).toBe(201);
    } finally {
      if (previousRelayUrl === undefined) {
        delete process.env.GITFUSE_RELAY_URL;
      } else {
        process.env.GITFUSE_RELAY_URL = previousRelayUrl;
      }
      await relay.close();
    }
  });

  it("issues tokens repeatedly for the same correct PIN, sends notifications, and logs pairings", async () => {
    const email = "cli-pair-success@example.com";
    await seedPairingUser(email, "Pairing123");
    const sent: TransactionalEmailInput[] = [];

    const result = await pairCliDeviceWithPin({
      email,
      pin: "Pairing123",
      ipAddress: "203.0.113.10",
      deviceName: "Work Mac",
      deviceId: "device-one",
      issueToken: tokenIssuer(),
      sendNotification: async (input) => {
        sent.push(input);
      },
    });
    const secondResult = await pairCliDeviceWithPin({
      email,
      pin: "Pairing123",
      ipAddress: "203.0.113.10",
      deviceName: "Home Mac",
      deviceId: "device-two",
      issueToken: tokenIssuer("gf_second_token"),
      sendNotification: async (input) => {
        sent.push(input);
      },
    });

    expect(result).toMatchObject({
      ok: true,
      token: "gf_test_token",
      username: "cli-user",
      deviceId: "device-test-id",
    });
    expect(secondResult).toMatchObject({
      ok: true,
      token: "gf_second_token",
      username: "cli-user",
      deviceId: "device-test-id",
    });
    expect(sent).toHaveLength(2);
    expect(sent[0].to).toBe(email);
    expect(sent[0].text).toContain("Work Mac");
    expect(sent[1].text).toContain("Home Mac");
    expect(await attemptCount(email, true)).toBe(2);
  });

  it("suggests fallback on the third consecutive wrong PIN without hard locking a later correct PIN", async () => {
    const email = "cli-pair-fallback@example.com";
    await seedPairingUser(email, "Correct123");

    const first = await pairCliDeviceWithPin({
      email,
      pin: "Wrong123",
      ipAddress: "203.0.113.11",
      issueToken: tokenIssuer(),
    });
    const second = await pairCliDeviceWithPin({
      email,
      pin: "Wrong123",
      ipAddress: "203.0.113.11",
      issueToken: tokenIssuer(),
    });
    const third = await pairCliDeviceWithPin({
      email,
      pin: "Wrong123",
      ipAddress: "203.0.113.11",
      issueToken: tokenIssuer(),
    });
    const fourth = await pairCliDeviceWithPin({
      email,
      pin: "Correct123",
      ipAddress: "203.0.113.11",
      issueToken: tokenIssuer("gf_after_fallback"),
      sendNotification: async () => undefined,
    });

    expect(first).toEqual({
      ok: false,
      error: "invalid_credentials",
      suggestFallback: false,
    });
    expect(second).toEqual({
      ok: false,
      error: "invalid_credentials",
      suggestFallback: false,
    });
    expect(third).toEqual({
      ok: false,
      error: "invalid_credentials",
      suggestFallback: true,
    });
    expect(fourth).toMatchObject({ ok: true, token: "gf_after_fallback" });
  });

  it("returns the same generic shape for a missing email and a wrong PIN on a valid email", async () => {
    const email = "cli-pair-shape@example.com";
    await seedPairingUser(email, "Shape123");

    const missingEmail = await pairCliDeviceWithPin({
      email: "missing-cli-pair@example.com",
      pin: "Shape123",
      ipAddress: "203.0.113.12",
      issueToken: tokenIssuer(),
    });
    const wrongPin = await pairCliDeviceWithPin({
      email,
      pin: "Wrong123",
      ipAddress: "203.0.113.12",
      issueToken: tokenIssuer(),
    });

    expect(missingEmail).toEqual({
      ok: false,
      error: "invalid_credentials",
      suggestFallback: false,
    });
    expect(wrongPin).toEqual(missingEmail);
  });

  it("rate limits the twenty-first failed attempt from one IP across different emails", async () => {
    for (let index = 0; index < 20; index += 1) {
      await expect(
        pairCliDeviceWithPin({
          email: `cli-pair-throttle-${index}@example.com`,
          pin: "Wrong123",
          ipAddress: "198.51.100.44",
          issueToken: tokenIssuer(),
        }),
      ).resolves.toMatchObject({
        ok: false,
        error: "invalid_credentials",
      });
    }

    await expect(
      pairCliDeviceWithPin({
        email: "cli-pair-throttle-21@example.com",
        pin: "Wrong123",
        ipAddress: "198.51.100.44",
        issueToken: tokenIssuer(),
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: "rate_limited",
    });
  }, 15_000);

  it("invalidates the old PIN immediately after a settings PIN change", async () => {
    const email = "cli-pair-change@example.com";
    const user = await seedPairingUser(email, "OldPin123");

    await expect(
      pairCliDeviceWithPin({
        email,
        pin: "OldPin123",
        ipAddress: "203.0.113.13",
        issueToken: tokenIssuer("gf_old"),
        sendNotification: async () => undefined,
      }),
    ).resolves.toMatchObject({ ok: true, token: "gf_old" });

    await setPairingPin(user.id, "NewPin123", {
      currentPin: "OldPin123",
      sendNotification: async () => undefined,
    });

    await expect(
      pairCliDeviceWithPin({
        email,
        pin: "OldPin123",
        ipAddress: "203.0.113.13",
        issueToken: tokenIssuer(),
      }),
    ).resolves.toEqual({
      ok: false,
      error: "invalid_credentials",
      suggestFallback: false,
    });

    await expect(
      pairCliDeviceWithPin({
        email,
        pin: "NewPin123",
        ipAddress: "203.0.113.13",
        issueToken: tokenIssuer("gf_new"),
        sendNotification: async () => undefined,
      }),
    ).resolves.toMatchObject({ ok: true, token: "gf_new" });
  });

  it("rejects changing an existing PIN without the correct current PIN, then succeeds with it", async () => {
    const email = "cli-pair-current-pin@example.com";
    const user = await seedPairingUser(email, "Current123");
    const sent: TransactionalEmailInput[] = [];

    await expect(
      setPairingPin(user.id, "NextPin123", {
        sendNotification: async (input) => {
          sent.push(input);
        },
      }),
    ).resolves.toEqual({
      ok: false,
      error: "Enter your current PIN to change it.",
    });

    await expect(
      setPairingPin(user.id, "NextPin123", {
        currentPin: "Wrong123",
        sendNotification: async (input) => {
          sent.push(input);
        },
      }),
    ).resolves.toEqual({
      ok: false,
      error: "Current PIN is incorrect.",
    });

    await expect(
      setPairingPin(user.id, "NextPin123", {
        currentPin: "Current123",
        sendNotification: async (input) => {
          sent.push(input);
        },
      }),
    ).resolves.toEqual({ ok: true });

    expect(sent).toHaveLength(1);
    expect(sent[0].subject).toContain("pairing PIN");
  });

  it("reveals the encrypted current PIN only after a correct OTP", async () => {
    const email = "cli-pair-reveal@example.com";
    const user = await seedPairingUser(email, "Reveal123");
    const code = await createOtp(user.id, email, "pairing_pin_reveal");

    await expect(
      revealPairingPinWithOtp({
        userId: user.id,
        email,
        otpCode: "000000",
      }),
    ).resolves.toEqual({ ok: false, error: "invalid_otp" });

    await expect(
      revealPairingPinWithOtp({
        userId: user.id,
        email,
        otpCode: code,
      }),
    ).resolves.toEqual({ ok: true, pin: "Reveal123" });
  });

  it("sets a first-time PIN without current-PIN verification", async () => {
    const email = "cli-pair-first-time@example.com";
    const sql = getSql();
    await cleanupEmail(email);
    const [user] = await sql<{ id: string }[]>`
      insert into users (github_id, github_username, email, email_verified_at)
      values (${`email:${email}`}, 'cli-pair-first-time', ${email}, now())
      returning id
    `;

    await expect(
      setPairingPin(user.id, "FirstPin123", {
        sendNotification: async () => undefined,
      }),
    ).resolves.toEqual({ ok: true });

    await expect(getPairingSecuritySummary(user.id)).resolves.toMatchObject({
      pairingPinSet: true,
      legacyPairingPinNeedsReset: false,
    });
  });

  it("treats leftover hash-only PIN rows as no current PIN and shows the reset-required state", async () => {
    const email = "cli-pair-legacy@example.com";
    const sql = getSql();
    await cleanupEmail(email);
    const [user] = await sql<{ id: string }[]>`
      insert into users (github_id, github_username, email, email_verified_at, pairing_pin_hash)
      values (
        ${`email:${email}`},
        'cli-pair-legacy',
        ${email},
        now(),
        '$2b$12$legacyhashcannotberecovered000000000000000000000000000000'
      )
      returning id
    `;

    await expect(getPairingSecuritySummary(user.id)).resolves.toMatchObject({
      pairingPinSet: false,
      legacyPairingPinNeedsReset: true,
    });

    await expect(
      setPairingPin(user.id, "Recovered123", {
        sendNotification: async () => undefined,
      }),
    ).resolves.toEqual({ ok: true });

    await expect(getPairingSecuritySummary(user.id)).resolves.toMatchObject({
      pairingPinSet: true,
      legacyPairingPinNeedsReset: false,
    });
  });
});
