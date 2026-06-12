import { createHash, randomInt } from "node:crypto";

import { getSql } from "./db";
import { sendLoginOtp } from "./resend";

export type OtpPurpose = "add_email" | "sign_in_email";

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

export async function createOtp(userId: string | null, email: string, purpose: OtpPurpose): Promise<string> {
  const normalizedEmail = normalizeEmail(email);
  const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
  const expiresAt = new Date(Date.now() + challengeTtlMs).toISOString();
  const sql = getSql();

  await sql`
    insert into email_verification_otps (user_id, email, otp_code, purpose, expires_at)
    values (${userId}, ${normalizedEmail}, ${hashOtp(normalizedEmail, code)}, ${purpose}, ${expiresAt})
  `;

  return code;
}

export async function sendOtpEmail(email: string, code: string, purpose: OtpPurpose): Promise<void> {
  await sendLoginOtp({
    email: normalizeEmail(email),
    code,
    subject:
      purpose === "add_email"
        ? `Your GitFuse verification code: ${code}`
        : `Your GitFuse verification code: ${code}`
  });
}

export async function verifyOtp(
  userId: string | null,
  email: string,
  code: string,
  purpose: OtpPurpose
): Promise<boolean> {
  const normalizedEmail = normalizeEmail(email);
  const normalizedCode = code.trim();
  if (!normalizedCode) return false;

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

  if (!otp || otp.otp_code !== hashOtp(normalizedEmail, normalizedCode)) return false;

  await sql`
    update email_verification_otps
    set used_at = now()
    where id = ${otp.id}
  `;

  return true;
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
