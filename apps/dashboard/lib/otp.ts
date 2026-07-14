import { createHash, randomInt, timingSafeEqual } from "node:crypto";

import { getSql } from "./db";

export type OtpPurpose =
  | "add_email"
  | "delete_account"
  | "sign_in_email"
  | "pairing_pin_reveal";

type OtpResult =
  | { ok: true }
  | { ok: false; reason: "missing" | "expired" | "invalid" | "locked" };

const challengeTtlMs = 10 * 60 * 1000;

function otpSecret() {
  return process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET ?? "gitfuse-local-otp-secret";
}

function hashOtp(email: string, code: string) {
  return createHash("sha256")
    .update(`${otpSecret()}:${email}:${code}`)
    .digest("hex");
}

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function isOtpCooldownActive(
  userId: string,
  email: string,
  purpose: OtpPurpose,
  cooldownSeconds = 60,
) {
  const normalizedEmail = normalizeEmail(email);
  const sql = getSql();
  const [recent] = await sql<{ exists: boolean }[]>`
    select exists (
      select 1
      from email_verification_otps
      where user_id = ${userId}
        and email = ${normalizedEmail}
        and purpose = ${purpose}
        and created_at > now() - (${cooldownSeconds} * interval '1 second')
    ) as exists
  `;

  return recent?.exists ?? false;
}

export async function createOtp(userId: string | null, email: string, purpose: OtpPurpose): Promise<string> {
  const normalizedEmail = normalizeEmail(email);
  const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
  const expiresAt = new Date(Date.now() + challengeTtlMs).toISOString();
  const sql = getSql();

  await sql`
    update email_verification_otps
    set used_at = now()
    where email = ${normalizedEmail}
      and purpose = ${purpose}
      and used_at is null
      and (${userId}::uuid is null or user_id = ${userId})
  `;

  await sql`
    insert into email_verification_otps (user_id, email, otp_code, purpose, expires_at)
    values (${userId}, ${normalizedEmail}, ${hashOtp(normalizedEmail, code)}, ${purpose}, ${expiresAt})
  `;

  return code;
}

export async function sendOtpEmail(email: string, code: string, purpose: OtpPurpose): Promise<void> {
  const { sendTransactionalEmail } = await import("./email");
  const purposeCopy =
    purpose === "delete_account"
      ? "confirm deleting your GitFuse account"
      : purpose === "add_email"
        ? "verify this email for your GitFuse account"
        : purpose === "pairing_pin_reveal"
          ? "reveal your GitFuse pairing PIN"
          : "finish signing in to GitFuse";

  await sendTransactionalEmail({
    to: normalizeEmail(email),
    subject: `Your GitFuse verification code: ${code}`,
    text: [
      "GitFuse verification code",
      "",
      code,
      "",
      `Use this code to ${purposeCopy}.`,
      "This code expires in 10 minutes.",
      "If you did not request this, ignore this email.",
    ].join("\n"),
    html: `
      <h1>GitFuse verification code</h1>
      <p>Use this one-time code to ${purposeCopy}.</p>
      <p style="font-family:monospace;font-size:32px;font-weight:700;letter-spacing:8px">${code}</p>
      <p>This code expires in 10 minutes. If you did not request it, ignore this email.</p>
    `,
  });
}

function hashesMatch(expected: string, actual: string) {
  const expectedBuffer = Buffer.from(expected, "hex");
  const actualBuffer = Buffer.from(actual, "hex");

  return (
    expectedBuffer.length === actualBuffer.length &&
    timingSafeEqual(expectedBuffer, actualBuffer)
  );
}

export async function verifyOtp(
  userId: string | null,
  email: string,
  code: string,
  purpose: OtpPurpose
): Promise<boolean> {
  const normalizedEmail = normalizeEmail(email);
  const normalizedCode = code.trim();
  if (!/^\d{6}$/.test(normalizedCode)) return false;

  const sql = getSql();
  const [otp] = await sql<{ id: string; otp_code: string }[]>`
    select id, otp_code
    from email_verification_otps
    where email = ${normalizedEmail}
      and purpose = ${purpose}
      and used_at is null
      and expires_at > now()
      and (${userId}::uuid is null or user_id = ${userId})
    order by created_at desc
    limit 1
  `;

  if (!otp || !hashesMatch(otp.otp_code, hashOtp(normalizedEmail, normalizedCode))) {
    return false;
  }

  const updated = await sql<{ id: string }[]>`
    update email_verification_otps
    set used_at = now()
    where id = ${otp.id}
      and used_at is null
    returning id
  `;

  return updated.length === 1;
}

export async function createOtpChallenge(email: string) {
  const normalizedEmail = normalizeEmail(email);
  const code = await createOtp(null, normalizedEmail, "sign_in_email");
  return { email: normalizedEmail, code, expiresAt: Date.now() + challengeTtlMs };
}

export async function verifyOtpChallenge(email: string, code: string): Promise<OtpResult> {
  const ok = await verifyOtp(null, email, code, "sign_in_email");
  return ok ? { ok: true } : { ok: false, reason: "invalid" };
}
