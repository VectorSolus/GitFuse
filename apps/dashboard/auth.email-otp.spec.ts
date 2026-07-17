import "./test/env";

import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { deleteDashboardAccountWithOtp } from "./lib/account-delete";
import { findDashboardAccountByEmail } from "./lib/account";
import {
  authorizeEmailPassword,
  requestEmailPasswordOtp,
} from "./lib/auth-email";
import { getSql } from "./lib/db";
import { createOtp } from "./lib/otp";

const testEmails = [
  "auth-signup@example.com",
  "auth-wrong-otp@example.com",
  "auth-returning@example.com",
  "auth-delete@example.com",
  "auth-resignup@example.com",
];

function makeSender() {
  const sent: Array<{ email: string; code: string; purpose: string }> = [];

  return {
    sent,
    sendOtp: async (email: string, code: string, purpose: string) => {
      sent.push({ email, code, purpose });
    },
  };
}

async function cleanupEmail(email: string) {
  const sql = getSql();
  const normalizedEmail = email.toLowerCase();
  const users = await sql<{ id: string }[]>`
    select id
    from users
    where lower(email) = lower(${normalizedEmail})
  `;
  const userIds = users.map((user) => user.id);

  if (userIds.length > 0) {
    await sql`
      update bundles
      set parent_bundle_id = null
      where repository_id in (
        select id from repositories where user_id in ${sql(userIds)}
      )
    `;
    await sql`
      delete from sync_event_commits
      where repository_id in (
        select id from repositories where user_id in ${sql(userIds)}
      )
    `;
    await sql`
      delete from sync_events
      where repository_id in (
        select id from repositories where user_id in ${sql(userIds)}
      )
         or device_id in (
          select id from devices where user_id in ${sql(userIds)}
        )
    `;
    await sql`
      delete from bundles
      where repository_id in (
        select id from repositories where user_id in ${sql(userIds)}
      )
         or device_id in (
          select id from devices where user_id in ${sql(userIds)}
        )
    `;
    await sql`
      delete from repositories
      where user_id in ${sql(userIds)}
    `;
    await sql`
      delete from devices
      where user_id in ${sql(userIds)}
    `;
    await sql`
      delete from cli_auth_sessions
      where user_id in ${sql(userIds)}
    `;
    await sql`
      delete from plans
      where user_id in ${sql(userIds)}
    `;
    await sql`
      delete from email_verification_otps
      where email = ${normalizedEmail}
         or user_id in ${sql(userIds)}
    `;
    await sql`
      delete from users
      where id in ${sql(userIds)}
    `;
  }

  await sql`
    delete from email_verification_otps
    where email = ${normalizedEmail}
  `;
}

async function cleanupAll() {
  for (const email of testEmails) {
    await cleanupEmail(email);
  }
}

async function seedVerifiedEmailUser(email: string, password: string) {
  const sender = makeSender();
  const request = await requestEmailPasswordOtp({
    email,
    password,
    sendOtp: sender.sendOtp,
  });
  expect(request).toMatchObject({ ok: true, next: "otp_required" });
  const code = sender.sent.at(-1)?.code;
  expect(code).toMatch(/^\d{6}$/);

  const user = await authorizeEmailPassword({
    email,
    password,
    otp: code,
  });
  expect(user?.email_verified_at).toBeTruthy();

  return user!;
}

async function seedRelatedRows(userId: string) {
  const sql = getSql();
  const suffix = randomUUID();

  const [device] = await sql<{ id: string }[]>`
    insert into devices (user_id, name, token_hash)
    values (${userId}, 'Delete test device', ${`token-${suffix}`})
    returning id
  `;
  const [repository] = await sql<{ id: string }[]>`
    insert into repositories (user_id, root_sha, display_name, relay_entry_id)
    values (${userId}, ${`root-${suffix}`}, 'Delete test repo', ${`relay-${suffix}`})
    returning id
  `;
  const [syncEvent] = await sql<{ id: string }[]>`
    insert into sync_events (
      repository_id,
      device_id,
      event_type,
      commit_count,
      bundle_size_bytes
    )
    values (${repository.id}, ${device.id}, 'sync', 1, 128)
    returning id
  `;
  await sql`
    insert into sync_event_commits (sync_event_id, repository_id, sha, message)
    values (${syncEvent.id}, ${repository.id}, ${`sha-${suffix}`}, 'Delete test commit')
  `;
  await sql`
    insert into bundles (
      repository_id,
      device_id,
      bundle_hash,
      commit_count,
      size_bytes,
      r2_key,
      expires_at
    )
    values (
      ${repository.id},
      ${device.id},
      ${`bundle-${suffix}`},
      1,
      128,
      ${`r2-${suffix}`},
      now() + interval '1 day'
    )
  `;
  await sql`
    insert into cli_auth_sessions (code, user_id, device_name, expires_at)
    values (${`code-${suffix}`}, ${userId}, 'Delete test session', now() + interval '1 day')
  `;
}

async function relatedCounts(userId: string, email: string) {
  const sql = getSql();
  const [counts] = await sql<{
    users: string | number;
    plans: string | number;
    devices: string | number;
    repositories: string | number;
    bundles: string | number;
    sync_events: string | number;
    sync_event_commits: string | number;
    cli_auth_sessions: string | number;
    otps: string | number;
  }[]>`
    select
      (select count(*) from users where id = ${userId}) as users,
      (select count(*) from plans where user_id = ${userId}) as plans,
      (select count(*) from devices where user_id = ${userId}) as devices,
      (select count(*) from repositories where user_id = ${userId}) as repositories,
      (
        select count(*)
        from bundles
        where repository_id in (
          select id from repositories where user_id = ${userId}
        )
      ) as bundles,
      (
        select count(*)
        from sync_events
        where repository_id in (
          select id from repositories where user_id = ${userId}
        )
           or device_id in (
            select id from devices where user_id = ${userId}
          )
      ) as sync_events,
      (
        select count(*)
        from sync_event_commits
        where repository_id in (
          select id from repositories where user_id = ${userId}
        )
      ) as sync_event_commits,
      (select count(*) from cli_auth_sessions where user_id = ${userId}) as cli_auth_sessions,
      (
        select count(*)
        from email_verification_otps
        where user_id = ${userId}
           or lower(email) = lower(${email})
      ) as otps
  `;

  return Object.fromEntries(
    Object.entries(counts).map(([key, value]) => [key, Number(value)]),
  );
}

beforeEach(async () => {
  await cleanupAll();
});

afterAll(async () => {
  await cleanupAll();
});

describe("email/password OTP auth", () => {
  it("new signup sends an OTP, verifies the account, and can route to dashboard", async () => {
    const email = "auth-signup@example.com";
    const password = "correct horse battery staple";
    const sender = makeSender();

    const request = await requestEmailPasswordOtp({
      email,
      password,
      sendOtp: sender.sendOtp,
    });

    expect(request).toMatchObject({
      ok: true,
      next: "otp_required",
      sent: true,
    });
    expect(sender.sent).toHaveLength(1);
    expect(sender.sent[0]).toMatchObject({
      email,
      purpose: "sign_in_email",
    });

    const userBeforeOtp = await findDashboardAccountByEmail(email);
    expect(userBeforeOtp?.password_hash).toBeTruthy();
    expect(userBeforeOtp?.email_verified_at).toBeNull();

    const signedInUser = await authorizeEmailPassword({
      email,
      password,
      otp: sender.sent[0].code,
    });

    expect(signedInUser?.email_verified_at).toBeTruthy();
    expect(signedInUser ? "/dashboard" : "/login").toBe("/dashboard");
  });

  it("wrong OTP does not verify the account and stays on the OTP step", async () => {
    const email = "auth-wrong-otp@example.com";
    const password = "correct horse battery staple";
    const sender = makeSender();

    await requestEmailPasswordOtp({
      email,
      password,
      sendOtp: sender.sendOtp,
    });

    await expect(
      authorizeEmailPassword({
        email,
        password,
        otp: "000000",
      }),
    ).resolves.toBeNull();

    const user = await findDashboardAccountByEmail(email);
    expect(user?.email_verified_at).toBeNull();
  });

  it("returning verified email/password login does not send an OTP and can route straight to dashboard", async () => {
    const email = "auth-returning@example.com";
    const password = "correct horse battery staple";
    const user = await seedVerifiedEmailUser(email, password);

    await expect(
      authorizeEmailPassword({
        email,
        password,
      }),
    ).resolves.toMatchObject({ id: user.id });

    await expect(
      requestEmailPasswordOtp({
        email,
        password,
        sendOtp: async () => {
          throw new Error("returning login should not send OTP");
        },
      }),
    ).resolves.toEqual({ ok: true, next: "password_signin_available" });
    expect(user ? "/dashboard" : "/login").toBe("/dashboard");
  });

  it("account deletion requires OTP and hard-deletes related account rows", async () => {
    const email = "auth-delete@example.com";
    const password = "correct horse battery staple";
    const user = await seedVerifiedEmailUser(email, password);
    await seedRelatedRows(user.id);

    const deleteCode = await createOtp(user.id, email, "delete_account");

    await expect(
      deleteDashboardAccountWithOtp({
        userId: user.id,
        otpCode: "000000",
      }),
    ).resolves.toEqual({ ok: false, error: "INVALID_OTP" });

    await expect(
      deleteDashboardAccountWithOtp({
        userId: user.id,
        otpCode: deleteCode,
      }),
    ).resolves.toEqual({ ok: true, email });

    await expect(relatedCounts(user.id, email)).resolves.toEqual({
      users: 0,
      plans: 0,
      devices: 0,
      repositories: 0,
      bundles: 0,
      sync_events: 0,
      sync_event_commits: 0,
      cli_auth_sessions: 0,
      otps: 0,
    });
  });

  it("re-signup with the same email after deletion is treated as a brand-new OTP signup", async () => {
    const email = "auth-resignup@example.com";
    const password = "correct horse battery staple";
    const firstUser = await seedVerifiedEmailUser(email, password);
    const deleteCode = await createOtp(firstUser.id, email, "delete_account");

    await deleteDashboardAccountWithOtp({
      userId: firstUser.id,
      otpCode: deleteCode,
    });

    const sender = makeSender();
    const request = await requestEmailPasswordOtp({
      email,
      password,
      sendOtp: sender.sendOtp,
    });

    expect(request).toMatchObject({ ok: true, next: "otp_required" });
    expect(sender.sent).toHaveLength(1);

    const secondUserBeforeOtp = await findDashboardAccountByEmail(email);
    expect(secondUserBeforeOtp?.id).not.toBe(firstUser.id);
    expect(secondUserBeforeOtp?.email_verified_at).toBeNull();

    const secondUser = await authorizeEmailPassword({
      email,
      password,
      otp: sender.sent[0].code,
    });

    expect(secondUser?.id).toBe(secondUserBeforeOtp?.id);
    expect(secondUser?.email_verified_at).toBeTruthy();
  });
});
