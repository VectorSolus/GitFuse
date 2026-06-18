type ApproveCliAuthInput = {
  code: string;
  githubUsername: string;
  email?: string | null;
  approvalLog?: string | null;
};

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

  const relayURL = process.env.GITFUSE_RELAY_URL ?? process.env.RELAY_URL ?? "http://localhost:8787";
  const response = await fetch(`${relayURL.replace(/\/$/, "")}/v1/auth/approve`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      code: input.code,
      githubUsername: input.githubUsername,
      email: input.email ?? undefined
    })
  });

  if (!response.ok) {
    throw new Error(`CLI auth approval failed with status ${response.status}`);
  }

  return response.json() as Promise<{ approved: boolean }>;
}

export type CliAuthSessionStatus =
  | { state: "missing_code" }
  | { state: "relay_unavailable" }
  | { state: "expired" }
  | { state: "server_error"; status: number }
  | { state: "pending"; approved: false }
  | { state: "approved"; approved: true };

export async function getCliAuthSessionStatus(
  code: string,
): Promise<CliAuthSessionStatus> {
  if (!code) return { state: "missing_code" };

  const relayURL =
    process.env.GITFUSE_RELAY_URL ?? process.env.RELAY_URL ?? "http://localhost:8787";

  try {
    const response = await fetch(
      `${relayURL.replace(/\/$/, "")}/v1/auth/poll/${encodeURIComponent(code)}`,
      { cache: "no-store" },
    );

    if (response.status === 404) return { state: "expired" };
    if (!response.ok) return { state: "server_error", status: response.status };

    const result = (await response.json()) as { approved?: boolean };
    if (result.approved) return { state: "approved", approved: true };
    return { state: "pending", approved: false };
  } catch {
    return { state: "relay_unavailable" };
  }
}
