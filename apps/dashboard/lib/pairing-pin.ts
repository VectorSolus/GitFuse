import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

import { findDashboardAccountByEmail } from "./account";
import {
  isCliAuthDeviceLimitReachedError,
  issueCliDeviceTokenViaRelay,
} from "./cli-auth";
import { getSql } from "./db";
import { sendTransactionalEmail, type TransactionalEmailInput } from "./email";
import { createOtp, isValidEmail, normalizeEmail, sendOtpEmail, verifyOtp } from "./otp";
import { isValidPairingPin, pairingPinStrength } from "./password";

const pairingWindowMinutes = 15;
const emailFailureThreshold = 3;
const ipFailureThreshold = 20;

export type PairingEvent = {
  id: string;
  createdAt: string;
  ipAddress: string;
  deviceName: string | null;
};

export type PairingSecuritySummary = {
  pairingPinSet: boolean;
  legacyPairingPinNeedsReset: boolean;
  pairingPinUpdatedAt: string | null;
  pairingEvents: PairingEvent[];
};

export type PairingTokenResponse = {
  token: string;
  username: string;
  deviceId: string;
  authSessionExpiresAt?: string;
};

type PairCliDeviceInput = {
  email: string;
  pin: string;
  ipAddress: string;
  deviceName?: string | null;
  deviceId?: string | null;
  issueToken?: (input: {
    user: Pick<PairingUser, "id" | "github_username" | "email">;
    deviceName?: string | null;
    deviceId?: string | null;
  }) => Promise<PairingTokenResponse>;
  sendNotification?: (input: TransactionalEmailInput) => Promise<void>;
};

type VerifyCliOtpInput = {
  email: string;
  code: string;
  ipAddress: string;
  deviceName?: string | null;
  deviceId?: string | null;
};

type PairCliDeviceResult =
  | ({ ok: true } & PairingTokenResponse)
  | { ok: false; error: "invalid_credentials"; suggestFallback: boolean }
  | { ok: false; error: "rate_limited"; retryAfterSeconds: number }
  | { ok: false; error: "device_limit_reached"; current: number; max: number };

type OtpFallbackRequestResult =
  | { ok: true; sent: true }
  | { ok: false; error: "invalid_email" | "unknown_account" | "delivery_failed" };

type OtpFallbackVerifyResult =
  | ({ ok: true } & PairingTokenResponse)
  | { ok: false; error: "invalid_email" | "invalid_otp" | "unknown_account" | "approval_failed" };

type PairingUser = {
  id: string;
  github_username: string;
  email: string;
  pairing_pin_hash: string | null;
  pairing_pin_encrypted: string | null;
  pairing_pin_updated_at: Date | string | null;
};

type SetPairingPinOptions = {
  currentPin?: string | null;
  sendNotification?: (input: TransactionalEmailInput) => Promise<void>;
};

type RevealPairingPinResult =
  | { ok: true; pin: string }
  | { ok: false; error: "no_pin" | "invalid_otp" | "decrypt_failed" };

export { isValidPairingPin, pairingPinStrength };

const pairingPinEncryptionKey = loadPairingPinEncryptionKey();

function normalizedDeviceName(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed || "gitfuse-cli";
}

function loadPairingPinEncryptionKey() {
  const raw = process.env.PAIRING_PIN_ENCRYPTION_KEY?.trim();
  if (!raw) {
    throw new Error(
      "PAIRING_PIN_ENCRYPTION_KEY is required to manage pairing PINs. Generate one with: openssl rand -hex 32",
    );
  }

  const candidates: Buffer[] = [];
  if (/^[0-9a-f]{64}$/i.test(raw)) {
    candidates.push(Buffer.from(raw, "hex"));
  }
  if (/^[A-Za-z0-9+/]+={0,2}$/.test(raw) || /^[A-Za-z0-9_-]+$/.test(raw)) {
    candidates.push(Buffer.from(raw, "base64"));
  }
  candidates.push(Buffer.from(raw, "utf8"));

  const key = candidates.find((candidate) => candidate.length === 32);
  if (!key) {
    throw new Error(
      "PAIRING_PIN_ENCRYPTION_KEY must be a 32-byte key for AES-256-GCM (64 hex characters from `openssl rand -hex 32`, base64 from `openssl rand -base64 32`, or exactly 32 UTF-8 bytes).",
    );
  }

  return key;
}

function encryptPairingPin(pin: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", pairingPinEncryptionKey, iv);
  const ciphertext = Buffer.concat([cipher.update(pin, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [
    "v1",
    iv.toString("base64url"),
    tag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(":");
}

function decryptPairingPin(encrypted: string) {
  const [version, ivValue, tagValue, ciphertextValue] = encrypted.split(":");
  if (version !== "v1" || !ivValue || !tagValue || !ciphertextValue) {
    throw new Error("Unsupported pairing PIN ciphertext format.");
  }

  const decipher = createDecipheriv(
    "aes-256-gcm",
    pairingPinEncryptionKey,
    Buffer.from(ivValue, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));

  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextValue, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function findPairingUserByEmail(email: string) {
  const sql = getSql();
  const [user] = await sql<PairingUser[]>`
    select id, github_username, email, pairing_pin_hash, pairing_pin_encrypted, pairing_pin_updated_at
    from users
    where lower(email) = lower(${email})
    order by updated_at desc
    limit 1
  `;

  return user ?? null;
}

async function recordPairingAttempt(input: {
  userId?: string | null;
  email: string;
  ipAddress: string;
  deviceName?: string | null;
  success: boolean;
}) {
  const sql = getSql();
  await sql`
    insert into pairing_attempts (
      user_id,
      email_attempted,
      ip_address,
      device_name,
      success
    )
    values (
      ${input.userId ?? null},
      ${normalizeEmail(input.email)},
      ${input.ipAddress},
      ${input.deviceName ?? null},
      ${input.success}
    )
  `;
}

async function ipRateLimitState(ipAddress: string) {
  const sql = getSql();
  const rows = await sql<{ created_at: Date | string }[]>`
    select created_at
    from pairing_attempts
    where ip_address = ${ipAddress}
      and success = false
      and created_at > now() - (${pairingWindowMinutes} * interval '1 minute')
    order by created_at asc
  `;

  if (rows.length < ipFailureThreshold) {
    return { limited: false as const };
  }

  const oldest = new Date(rows[0].created_at).getTime();
  const retryAfterSeconds = Math.max(
    1,
    Math.ceil((oldest + pairingWindowMinutes * 60 * 1000 - Date.now()) / 1000),
  );

  return { limited: true as const, retryAfterSeconds };
}

async function consecutiveEmailFailures(email: string) {
  const sql = getSql();
  const [row] = await sql<{ count: string | number }[]>`
    with recent as (
      select success, created_at
      from pairing_attempts
      where email_attempted = ${normalizeEmail(email)}
        and created_at > now() - (${pairingWindowMinutes} * interval '1 minute')
    ),
    last_success as (
      select max(created_at) as created_at
      from recent
      where success = true
    )
    select count(*)::int as count
    from recent
    where success = false
      and created_at > coalesce((select created_at from last_success), '-infinity'::timestamptz)
  `;

  return Number(row?.count ?? 0);
}

async function issueCliDeviceToken(input: {
  user: Pick<PairingUser, "id" | "github_username" | "email">;
  deviceName?: string | null;
  deviceId?: string | null;
}) {
  return issueCliDeviceTokenViaRelay({
    githubUsername: input.user.github_username,
    email: input.user.email,
    deviceName: normalizedDeviceName(input.deviceName),
    deviceId: input.deviceId,
  });
}

async function sendPairingNotification(input: {
  email: string;
  deviceName?: string | null;
  ipAddress: string;
  sendNotification?: (input: TransactionalEmailInput) => Promise<void>;
}) {
  const deviceLine = input.deviceName
    ? `Device: ${input.deviceName}`
    : "Device: Unknown CLI device";
  const ipLine = input.ipAddress ? `IP address: ${input.ipAddress}` : "IP address: Unknown";

  await (input.sendNotification ?? sendTransactionalEmail)({
    to: normalizeEmail(input.email),
    subject: "A new device was paired to your GitFuse account",
    text: [
      "A new device was just paired to your GitFuse account using your pairing PIN.",
      "",
      deviceLine,
      ipLine,
      "",
      "If this wasn't you, change your PIN immediately in Settings.",
    ].join("\n"),
    html: `
      <h1>New GitFuse device paired</h1>
      <p>A new device was just paired to your GitFuse account using your pairing PIN.</p>
      <p><strong>${escapeHtml(deviceLine)}</strong><br />${escapeHtml(ipLine)}</p>
      <p>If this wasn't you, change your PIN immediately in Settings.</p>
    `,
  });
}

async function sendPairingPinChangedNotification(input: {
  email: string;
  sendNotification?: (input: TransactionalEmailInput) => Promise<void>;
}) {
  await (input.sendNotification ?? sendTransactionalEmail)({
    to: normalizeEmail(input.email),
    subject: "Your GitFuse pairing PIN was changed",
    text: [
      "Your GitFuse pairing PIN was just changed.",
      "",
      "If this wasn't you, set a new one immediately and contact support.",
    ].join("\n"),
    html: `
      <h1>GitFuse pairing PIN changed</h1>
      <p>Your GitFuse pairing PIN was just changed.</p>
      <p>If this wasn't you, set a new one immediately and contact support.</p>
    `,
  });
}

export async function setPairingPin(
  userId: string,
  pin: string,
  options: SetPairingPinOptions = {},
) {
  if (!isValidPairingPin(pin)) {
    return {
      ok: false as const,
      error: "PIN must be at least 8 characters and include a letter and a number.",
    };
  }

  const sql = getSql();
  const [user] = await sql<{
    email: string;
    pairing_pin_encrypted: string | null;
  }[]>`
    select email, pairing_pin_encrypted
    from users
    where id = ${userId}
    limit 1
  `;

  if (!user) {
    return { ok: false as const, error: "Account not found." };
  }

  if (user.pairing_pin_encrypted) {
    const currentPin = options.currentPin?.trim() ?? "";
    if (!currentPin) {
      return { ok: false as const, error: "Enter your current PIN to change it." };
    }

    try {
      if (decryptPairingPin(user.pairing_pin_encrypted) !== currentPin) {
        return { ok: false as const, error: "Current PIN is incorrect." };
      }
    } catch (error) {
      console.error("[pairing-pin-decrypt]", error);
      return { ok: false as const, error: "Could not verify your current PIN." };
    }
  }

  const encryptedPin = encryptPairingPin(pin);
  await sql`
    update users
    set pairing_pin_encrypted = ${encryptedPin},
        pairing_pin_hash = null,
        pairing_pin_updated_at = now(),
        updated_at = now()
    where id = ${userId}
  `;

  try {
    await sendPairingPinChangedNotification({
      email: user.email,
      sendNotification: options.sendNotification,
    });
  } catch (error) {
    console.error("[pairing-pin-change-notification]", error);
  }

  return { ok: true as const };
}

export async function getPairingSecuritySummary(userId: string): Promise<PairingSecuritySummary> {
  const sql = getSql();
  const [user] = await sql<{
    pairing_pin_hash: string | null;
    pairing_pin_encrypted: string | null;
    pairing_pin_updated_at: Date | string | null;
  }[]>`
    select pairing_pin_hash, pairing_pin_encrypted, pairing_pin_updated_at
    from users
    where id = ${userId}
    limit 1
  `;
  const attempts = await sql<{
    id: string;
    created_at: Date | string;
    ip_address: string;
    device_name: string | null;
  }[]>`
    select id, created_at, ip_address, device_name
    from pairing_attempts
    where user_id = ${userId}
      and success = true
    order by created_at desc
    limit 10
  `;

  return {
    pairingPinSet: Boolean(user?.pairing_pin_encrypted),
    legacyPairingPinNeedsReset: Boolean(
      user?.pairing_pin_hash && !user?.pairing_pin_encrypted,
    ),
    pairingPinUpdatedAt: user?.pairing_pin_updated_at
      ? new Date(user.pairing_pin_updated_at).toISOString()
      : null,
    pairingEvents: attempts.map((attempt) => ({
      id: attempt.id,
      createdAt: new Date(attempt.created_at).toISOString(),
      ipAddress: attempt.ip_address,
      deviceName: attempt.device_name,
    })),
  };
}

export async function requestPairingPinRevealOtp(input: {
  userId: string;
  email: string;
}) {
  const sql = getSql();
  const [user] = await sql<{ pairing_pin_encrypted: string | null }[]>`
    select pairing_pin_encrypted
    from users
    where id = ${input.userId}
    limit 1
  `;

  if (!user?.pairing_pin_encrypted) {
    return { ok: false as const, error: "no_pin" as const };
  }

  const email = normalizeEmail(input.email);
  const code = await createOtp(input.userId, email, "pairing_pin_reveal");
  await sendOtpEmail(email, code, "pairing_pin_reveal");
  return { ok: true as const };
}

export async function revealPairingPinWithOtp(input: {
  userId: string;
  email: string;
  otpCode: string;
}): Promise<RevealPairingPinResult> {
  const email = normalizeEmail(input.email);
  const verified = await verifyOtp(
    input.userId,
    email,
    input.otpCode,
    "pairing_pin_reveal",
  );
  if (!verified) return { ok: false, error: "invalid_otp" };

  const sql = getSql();
  const [user] = await sql<{ pairing_pin_encrypted: string | null }[]>`
    select pairing_pin_encrypted
    from users
    where id = ${input.userId}
    limit 1
  `;

  if (!user?.pairing_pin_encrypted) {
    return { ok: false, error: "no_pin" };
  }

  try {
    return { ok: true, pin: decryptPairingPin(user.pairing_pin_encrypted) };
  } catch (error) {
    console.error("[pairing-pin-reveal]", error);
    return { ok: false, error: "decrypt_failed" };
  }
}

export async function pairCliDeviceWithPin(input: PairCliDeviceInput): Promise<PairCliDeviceResult> {
  const email = normalizeEmail(input.email);
  const deviceName = normalizedDeviceName(input.deviceName);
  const rateLimit = await ipRateLimitState(input.ipAddress);

  if (rateLimit.limited) {
    await recordPairingAttempt({
      email,
      ipAddress: input.ipAddress,
      deviceName,
      success: false,
    });
    return {
      ok: false,
      error: "rate_limited",
      retryAfterSeconds: rateLimit.retryAfterSeconds,
    };
  }

  const user = isValidEmail(email) ? await findPairingUserByEmail(email) : null;
  let pinMatches = false;
  if (user?.pairing_pin_encrypted) {
    try {
      pinMatches = decryptPairingPin(user.pairing_pin_encrypted) === input.pin;
    } catch (error) {
      console.error("[cli-pair-decrypt]", error);
    }
  }
  const success = Boolean(user?.pairing_pin_encrypted && pinMatches);

  if (!success || !user) {
    await recordPairingAttempt({
      userId: user?.id,
      email,
      ipAddress: input.ipAddress,
      deviceName,
      success: false,
    });

    const failures = await consecutiveEmailFailures(email);
    return {
      ok: false,
      error: "invalid_credentials",
      suggestFallback: failures >= emailFailureThreshold,
    };
  }

  let token: PairingTokenResponse;
  try {
    token = await (input.issueToken ?? issueCliDeviceToken)({
      user,
      deviceName,
      deviceId: input.deviceId ?? null,
    });
  } catch (error) {
    if (isCliAuthDeviceLimitReachedError(error)) {
      return {
        ok: false,
        error: "device_limit_reached",
        current: Number(error.current),
        max: Number(error.max),
      };
    }
    throw error;
  }

  await recordPairingAttempt({
    userId: user.id,
    email,
    ipAddress: input.ipAddress,
    deviceName,
    success: true,
  });

  try {
    await sendPairingNotification({
      email: user.email,
      deviceName,
      ipAddress: input.ipAddress,
      sendNotification: input.sendNotification,
    });
  } catch (error) {
    console.error("[cli-pair-notification]", error);
  }

  return { ok: true, ...token };
}

export async function requestCliOtpFallback(email: string): Promise<OtpFallbackRequestResult> {
  const normalized = normalizeEmail(email);
  if (!isValidEmail(normalized)) return { ok: false, error: "invalid_email" };

  const user = await findDashboardAccountByEmail(normalized);
  if (!user) return { ok: false, error: "unknown_account" };

  const code = await createOtp(user.id, normalized, "sign_in_email");

  try {
    await sendOtpEmail(normalized, code, "sign_in_email");
  } catch (error) {
    console.error("[cli-otp-fallback]", error);
    return { ok: false, error: "delivery_failed" };
  }

  return { ok: true, sent: true };
}

export async function verifyCliOtpFallback(input: VerifyCliOtpInput): Promise<OtpFallbackVerifyResult> {
  const email = normalizeEmail(input.email);
  if (!isValidEmail(email)) return { ok: false, error: "invalid_email" };

  const user = await findDashboardAccountByEmail(email);
  if (!user) return { ok: false, error: "unknown_account" };

  const verified = await verifyOtp(user.id, email, input.code, "sign_in_email");
  if (!verified) return { ok: false, error: "invalid_otp" };

  try {
    const token = await issueCliDeviceToken({
      user: {
        id: user.id,
        github_username: user.github_username,
        email: user.email,
      },
      deviceName: input.deviceName,
      deviceId: input.deviceId,
    });

    return { ok: true, ...token };
  } catch (error) {
    console.error("[cli-otp-fallback-approval]", error);
    return { ok: false, error: "approval_failed" };
  }
}
