import { randomUUID } from "node:crypto";

type ApproveCliAuthInput = {
  code: string;
  githubUsername: string;
  email?: string | null;
  approvalLog?: string | null;
};

type CreateCliAuthInput = {
  code: string;
  deviceName: string;
  deviceId?: string | null;
};

type IssueCliDeviceTokenInput = {
  githubUsername: string;
  email?: string | null;
  deviceName: string;
  deviceId?: string | null;
};

export type IssuedCliDeviceToken = {
  token: string;
  username: string;
  deviceId: string;
  code: string;
  authSessionExpiresAt: string;
};

export class CliAuthDeviceLimitReachedError extends Error {
  current: number;
  max: number;

  constructor(current: number, max: number) {
    super("Device limit reached.");
    this.name = "DeviceLimitReachedError";
    this.current = current;
    this.max = max;
  }
}

export function isCliAuthDeviceLimitReachedError(
  error: unknown,
): error is CliAuthDeviceLimitReachedError {
  return error instanceof CliAuthDeviceLimitReachedError;
}

function relayBaseURL() {
  return (
    process.env.GITFUSE_RELAY_URL ??
    process.env.RELAY_URL ??
    "http://localhost:8787"
  ).replace(/\/$/, "");
}

async function jsonBody(response: Response) {
  return response.json().catch(() => null) as Promise<
    Record<string, unknown> | null
  >;
}

export async function createCliAuthSession(input: CreateCliAuthInput) {
  if (!input.code || !input.deviceName) {
    throw new Error("code and deviceName are required");
  }

  const response = await fetch(`${relayBaseURL()}/v1/auth/device`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      code: input.code,
      deviceName: input.deviceName,
      deviceId: input.deviceId ?? undefined,
    }),
  });

  if (!response.ok) {
    throw new Error(`CLI auth session creation failed with status ${response.status}`);
  }

  return response.json() as Promise<{ code: string; expiresAt: string }>;
}

export async function approveCliAuthSession(input: ApproveCliAuthInput) {
  if (!input.code || !input.githubUsername) {
    throw new Error("code and githubUsername are required");
  }

  const approvalLog = input.approvalLog ?? process.env.GITFUSE_CLI_AUTH_APPROVE_LOG;
  if (approvalLog) {
    const { appendFile } = await import("node:fs/promises");
    await appendFile(
      approvalLog,
      `code=${input.code} githubUsername=${input.githubUsername} email=${input.email ?? ""}\n`
    );
    return { approved: true };
  }

  const response = await fetch(`${relayBaseURL()}/v1/auth/approve`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      code: input.code,
      githubUsername: input.githubUsername,
      email: input.email ?? undefined,
    }),
  });

  if (!response.ok) {
    const body = await jsonBody(response);
    if (response.status === 403 && body?.error === "device_limit_reached") {
      throw new CliAuthDeviceLimitReachedError(
        Number(body.current ?? 0),
        Number(body.limit ?? body.max ?? 0),
      );
    }
    throw new Error(`CLI auth approval failed with status ${response.status}`);
  }

  return response.json() as Promise<{ approved: boolean }>;
}

export async function issueCliDeviceTokenViaRelay(
  input: IssueCliDeviceTokenInput,
): Promise<IssuedCliDeviceToken> {
  const code = randomUUID();
  const session = await createCliAuthSession({
    code,
    deviceName: input.deviceName,
    deviceId: input.deviceId,
  });

  await approveCliAuthSession({
    code,
    githubUsername: input.githubUsername,
    email: input.email,
  });

  const status = await getCliAuthSessionStatus(code);
  if (
    status.state !== "approved" ||
    !status.token ||
    !status.username ||
    !status.deviceId
  ) {
    throw new Error(`CLI auth token was not available after approval (${status.state}).`);
  }

  return {
    token: status.token,
    username: status.username,
    deviceId: status.deviceId,
    code: session.code,
    authSessionExpiresAt: session.expiresAt,
  };
}

export type CliAuthSessionStatus =
  | { state: "missing_code" }
  | { state: "relay_unavailable" }
  | { state: "expired" }
  | { state: "server_error"; status: number }
  | { state: "pending"; approved: false }
  | {
      state: "approved";
      approved: true;
      token?: string;
      username?: string;
      deviceId?: string;
    };

export async function getCliAuthSessionStatus(
  code: string,
): Promise<CliAuthSessionStatus> {
  if (!code) return { state: "missing_code" };

  try {
    const response = await fetch(
      `${relayBaseURL()}/v1/auth/poll/${encodeURIComponent(code)}`,
      { cache: "no-store" },
    );

    if (response.status === 404) return { state: "expired" };
    if (!response.ok) return { state: "server_error", status: response.status };

    const result = (await response.json()) as {
      approved?: boolean;
      token?: string;
      username?: string;
      deviceId?: string;
    };
    if (result.approved) {
      return {
        state: "approved",
        approved: true,
        token: result.token,
        username: result.username,
        deviceId: result.deviceId,
      };
    }
    return { state: "pending", approved: false };
  } catch {
    return { state: "relay_unavailable" };
  }
}
