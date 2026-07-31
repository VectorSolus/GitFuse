import "./test/env";

import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  findDashboardAccountByProviderIdentity,
  upsertDashboardAccount,
} from "./lib/account";
import {
  authorizeEmailPassword,
  requestEmailPasswordOtp,
} from "./lib/auth-email";
import { getSql } from "./lib/db";

const testEmails = [
  "account-link-email-first@example.com",
  "account-link-google-first@example.com",
  "account-link-github@example.com",
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

  await sql`
    delete from oauth_accounts
    where lower(email) = lower(${normalizedEmail})
  `;

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

async function seedPlanDeviceAndRepo(userId: string) {
  const sql = getSql();
  const suffix = randomUUID();

  await sql`
    update plans
    set tier = 'pro',
        requested_tier = 'pro',
        updated_at = now()
    where user_id = ${userId}
  `;
  await sql`
    insert into devices (user_id, name, token_hash)
    values (${userId}, 'Canonical link device', ${`token-${suffix}`})
  `;
  await sql`
    insert into repositories (user_id, root_sha, display_name, relay_entry_id)
    values (${userId}, ${`root-${suffix}`}, 'Canonical link repo', ${`relay-${suffix}`})
  `;
}

async function userCountForEmail(email: string) {
  const sql = getSql();
  const [row] = await sql<{ count: string | number }[]>`
    select count(*)::int as count
    from users
    where lower(email) = lower(${email})
  `;

  return Number(row?.count ?? 0);
}

async function ownedCounts(userId: string) {
  const sql = getSql();
  const [row] = await sql<{
    tier: "free" | "pro" | "team" | "enterprise";
    devices: string | number;
    repositories: string | number;
  }[]>`
    select
      (select tier from plans where user_id = ${userId} limit 1) as tier,
      (select count(*)::int from devices where user_id = ${userId}) as devices,
      (select count(*)::int from repositories where user_id = ${userId}) as repositories
  `;

  return {
    tier: row?.tier,
    devices: Number(row?.devices ?? 0),
    repositories: Number(row?.repositories ?? 0),
  };
}

beforeEach(async () => {
  await cleanupAll();
});

afterAll(async () => {
  await cleanupAll();
});

describe("canonical account linking", () => {
  it("links Google to the existing Email OTP account with the same verified email", async () => {
    const email = "account-link-email-first@example.com";
    const user = await seedVerifiedEmailUser(email, "correct horse battery staple");
    await seedPlanDeviceAndRepo(user.id);

    const result = await upsertDashboardAccount({
      provider: "google",
      providerAccountId: "google-link-email-first",
      username: "Google User",
      email: ` ${email.toUpperCase()} `,
      emailVerified: true,
      emailVerifiedAt: null,
    });
    const providerUser = await findDashboardAccountByProviderIdentity(
      "google",
      "google-link-email-first",
    );

    expect(result.user.id).toBe(user.id);
    expect(providerUser?.id).toBe(user.id);
    await expect(userCountForEmail(email)).resolves.toBe(1);
    await expect(ownedCounts(user.id)).resolves.toEqual({
      tier: "pro",
      devices: 1,
      repositories: 1,
    });
  });

  it("keeps one user when Email OTP is added after Google signup", async () => {
    const email = "account-link-google-first@example.com";
    const google = await upsertDashboardAccount({
      provider: "google",
      providerAccountId: "google-link-first",
      username: "Google First",
      email,
      emailVerified: true,
      emailVerifiedAt: "2026-07-31T00:00:00.000Z",
    });
    const sender = makeSender();

    const request = await requestEmailPasswordOtp({
      email: email.toUpperCase(),
      password: "correct horse battery staple",
      sendOtp: sender.sendOtp,
    });
    expect(request).toMatchObject({ ok: true, next: "otp_required" });

    const emailUser = await authorizeEmailPassword({
      email,
      password: "correct horse battery staple",
      otp: sender.sent[0].code,
    });

    expect(emailUser?.id).toBe(google.user.id);
    await expect(userCountForEmail(email)).resolves.toBe(1);
  });

  it("links GitHub to the existing Email OTP account when verified email is available", async () => {
    const email = "account-link-github@example.com";
    const user = await seedVerifiedEmailUser(email, "correct horse battery staple");

    const result = await upsertDashboardAccount({
      provider: "github",
      providerAccountId: "github-link-email-first",
      username: "octocat",
      email,
      emailVerified: true,
      emailVerifiedAt: null,
    });
    const providerUser = await findDashboardAccountByProviderIdentity(
      "github",
      "github-link-email-first",
    );

    expect(result.user.id).toBe(user.id);
    expect(providerUser?.id).toBe(user.id);
    await expect(userCountForEmail(email)).resolves.toBe(1);
  });
});
