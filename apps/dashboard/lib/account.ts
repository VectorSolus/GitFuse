import { getSql } from "./db";

export type AuthProvider = "email" | "google" | "github";

export type DashboardAccount = {
  id: string;
  github_id: string;
  github_username: string;
  email: string;
  password_hash: string | null;
};

type DashboardAccountInput = {
  provider?: AuthProvider;
  githubId?: string;
  githubUsername?: string;
  providerAccountId?: string;
  username?: string;
  email: string;
  passwordHash?: string | null;
};

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function inferProvider(providerAccountId: string): AuthProvider {
  if (providerAccountId.startsWith("google:")) return "google";
  if (providerAccountId.startsWith("github:")) return "github";
  return "email";
}

function rawProviderAccountId(
  provider: AuthProvider,
  providerAccountId: string,
) {
  const prefix = `${provider}:`;
  return providerAccountId.startsWith(prefix)
    ? providerAccountId.slice(prefix.length)
    : providerAccountId;
}

function storedProviderAccountId(
  provider: AuthProvider,
  providerAccountId: string,
) {
  return `${provider}:${rawProviderAccountId(provider, providerAccountId)}`;
}

export async function upsertDashboardAccount(input: DashboardAccountInput) {
  const suppliedProviderAccountId = input.providerAccountId ?? input.githubId;
  if (!suppliedProviderAccountId) {
    throw new Error("providerAccountId is required");
  }

  const provider =
    input.provider ??
    (input.githubId
      ? "github"
      : inferProvider(suppliedProviderAccountId));
  const providerAccountId = rawProviderAccountId(
    provider,
    suppliedProviderAccountId,
  );
  const storedAccountId = storedProviderAccountId(
    provider,
    providerAccountId,
  );
  const email = normalizeEmail(input.email);
  const username =
    input.username ??
    input.githubUsername ??
    email.split("@")[0] ??
    "gitfuse-user";

  const sql = getSql();
  const [existingUser] = await sql<DashboardAccount[]>`
    select id, github_id, github_username, email, password_hash
    from users
    where github_id = ${storedAccountId}
       or lower(email) = lower(${email})
    order by case when github_id = ${storedAccountId} then 0 else 1 end,
             updated_at desc
    limit 1
  `;

  let user: DashboardAccount;

  if (existingUser) {
    [user] = await sql<DashboardAccount[]>`
      update users
      set github_id = ${storedAccountId},
          github_username = ${username},
          email = ${email},
          password_hash = coalesce(${input.passwordHash ?? null}, password_hash),
          updated_at = now()
      where id = ${existingUser.id}
      returning id, github_id, github_username, email, password_hash
    `;
  } else {
    [user] = await sql<DashboardAccount[]>`
      insert into users (github_id, github_username, email, password_hash)
      values (
        ${storedAccountId},
        ${username},
        ${email},
        ${input.passwordHash ?? null}
      )
      on conflict (github_id)
      do update set
        github_username = excluded.github_username,
        email = excluded.email,
        password_hash = coalesce(excluded.password_hash, users.password_hash),
        updated_at = now()
      returning id, github_id, github_username, email, password_hash
    `;
  }

  await sql`
    insert into plans (user_id, tier, team_seat_count)
    values (${user.id}, 'free', 1)
    on conflict (user_id) do nothing
  `;

  const [plan] = await sql<{
    tier: "free" | "pro" | "team" | "enterprise";
  }[]>`
    select tier from plans where user_id = ${user.id} limit 1
  `;

  return { user, plan };
}

export async function findDashboardAccountById(userId: string) {
  const sql = getSql();
  const [user] = await sql<DashboardAccount[]>`
    select id, github_id, github_username, email, password_hash
    from users
    where id = ${userId}
    limit 1
  `;

  return user ?? null;
}

export async function findDashboardAccountByEmail(email: string) {
  const normalizedEmail = normalizeEmail(email);
  const sql = getSql();
  const [user] = await sql<DashboardAccount[]>`
    select id, github_id, github_username, email, password_hash
    from users
    where lower(email) = lower(${normalizedEmail})
    order by updated_at desc
    limit 1
  `;

  return user ?? null;
}

export async function findDashboardAccountByProviderIdentity(
  provider: AuthProvider,
  providerAccountId: string,
) {
  const storedAccountId = storedProviderAccountId(
    provider,
    providerAccountId,
  );
  const legacyAccountId = rawProviderAccountId(provider, providerAccountId);
  const sql = getSql();
  const [user] = await sql<DashboardAccount[]>`
    select id, github_id, github_username, email, password_hash
    from users
    where github_id = ${storedAccountId}
       or (${provider} = 'github' and github_id = ${legacyAccountId})
    order by updated_at desc
    limit 1
  `;

  return user ?? null;
}

export async function findDashboardAccountForSession(input: {
  id?: string | null;
  email?: string | null;
}) {
  if (input.id) {
    return findDashboardAccountById(input.id);
  }

  if (input.email) {
    return findDashboardAccountByEmail(input.email);
  }

  return null;
}

export async function setDashboardAccountPassword(
  userId: string,
  passwordHash: string,
) {
  const sql = getSql();
  const [user] = await sql<DashboardAccount[]>`
    update users
    set password_hash = ${passwordHash},
        updated_at = now()
    where id = ${userId}
    returning id, github_id, github_username, email, password_hash
  `;

  return user ?? null;
}
