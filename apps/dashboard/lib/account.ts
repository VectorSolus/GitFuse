import { getSql } from "./db";

export type AuthProvider = "email" | "google" | "github";
export type OAuthProviderStatus = Record<"github" | "google", boolean>;

export type DashboardAccount = {
  id: string;
  github_id: string;
  github_username: string;
  display_name: string;
  email: string;
  email_verified_at: string | Date | null;
  password_hash: string | null;
};

type DashboardAccountInput = {
  provider?: AuthProvider;
  githubId?: string;
  githubUsername?: string;
  providerAccountId?: string;
  username?: string;
  email: string;
  emailVerifiedAt?: string | null;
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

function normalizeDisplayName(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

async function upsertDashboardOAuthAccount(input: {
  userId: string;
  provider: Extract<AuthProvider, "github" | "google">;
  providerAccountId: string;
  email: string;
  displayName: string;
}) {
  const sql = getSql();
  await sql`
    insert into oauth_accounts (
      user_id,
      provider,
      provider_account_id,
      email,
      display_name
    )
    values (
      ${input.userId},
      ${input.provider},
      ${input.providerAccountId},
      ${input.email},
      ${input.displayName}
    )
    on conflict (user_id, provider)
    do update set
      provider_account_id = excluded.provider_account_id,
      email = excluded.email,
      display_name = excluded.display_name,
      updated_at = now()
  `;
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
    select
      users.id,
      users.github_id,
      users.github_username,
      coalesce(nullif(users.display_name, ''), users.github_username) as display_name,
      users.email,
      users.email_verified_at,
      users.password_hash
    from users
    left join oauth_accounts
      on oauth_accounts.user_id = users.id
      and oauth_accounts.provider = ${provider}
      and oauth_accounts.provider_account_id = ${providerAccountId}
    where oauth_accounts.user_id is not null
       or users.github_id = ${storedAccountId}
       or lower(users.email) = lower(${email})
    order by case
               when oauth_accounts.user_id is not null then 0
               when users.github_id = ${storedAccountId} then 1
               else 2
             end,
             users.updated_at desc
    limit 1
  `;

  let user: DashboardAccount;

  if (existingUser) {
    [user] = await sql<DashboardAccount[]>`
      update users
      set github_id = ${storedAccountId},
          github_username = ${username},
          display_name = coalesce(nullif(display_name, ''), ${username}),
          email = ${email},
          email_verified_at = coalesce(${input.emailVerifiedAt ?? null}, email_verified_at),
          password_hash = coalesce(${input.passwordHash ?? null}, password_hash),
          updated_at = now()
      where id = ${existingUser.id}
      returning
        id,
        github_id,
        github_username,
        coalesce(nullif(display_name, ''), github_username) as display_name,
        email,
        email_verified_at,
        password_hash
    `;
  } else {
    [user] = await sql<DashboardAccount[]>`
      insert into users (github_id, github_username, display_name, email, email_verified_at, password_hash)
      values (
        ${storedAccountId},
        ${username},
        ${username},
        ${email},
        ${input.emailVerifiedAt ?? null},
        ${input.passwordHash ?? null}
      )
      on conflict (github_id)
      do update set
        github_username = excluded.github_username,
        display_name = coalesce(nullif(users.display_name, ''), excluded.display_name),
        email = excluded.email,
        email_verified_at = coalesce(excluded.email_verified_at, users.email_verified_at),
        password_hash = coalesce(excluded.password_hash, users.password_hash),
        updated_at = now()
      returning
        id,
        github_id,
        github_username,
        coalesce(nullif(display_name, ''), github_username) as display_name,
        email,
        email_verified_at,
        password_hash
    `;
  }

  if (provider === "github" || provider === "google") {
    await upsertDashboardOAuthAccount({
      userId: user.id,
      provider,
      providerAccountId,
      email,
      displayName: username,
    });
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
    select
      id,
      github_id,
      github_username,
      coalesce(nullif(display_name, ''), github_username) as display_name,
      email,
      email_verified_at,
      password_hash
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
    select
      id,
      github_id,
      github_username,
      coalesce(nullif(display_name, ''), github_username) as display_name,
      email,
      email_verified_at,
      password_hash
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
    select
      users.id,
      users.github_id,
      users.github_username,
      coalesce(nullif(users.display_name, ''), users.github_username) as display_name,
      users.email,
      users.email_verified_at,
      users.password_hash
    from users
    left join oauth_accounts
      on oauth_accounts.user_id = users.id
      and oauth_accounts.provider = ${provider}
      and oauth_accounts.provider_account_id = ${legacyAccountId}
    where oauth_accounts.user_id is not null
       or users.github_id = ${storedAccountId}
       or (${provider} = 'github' and users.github_id = ${legacyAccountId})
    order by case when oauth_accounts.user_id is not null then 0 else 1 end,
             users.updated_at desc
    limit 1
  `;

  return user ?? null;
}

export async function findDashboardAccountAuthProviders(
  userId: string,
): Promise<OAuthProviderStatus> {
  const sql = getSql();
  const rows = await sql<{ provider: "github" | "google" }[]>`
    select distinct provider
    from oauth_accounts
    where user_id = ${userId}
      and provider in ('github', 'google')
    union
    select 'google' as provider
    from users
    where id = ${userId}
      and github_id like 'google:%'
    union
    select 'github' as provider
    from users
    where id = ${userId}
      and (github_id like 'github:%' or github_id not like '%:%')
  `;
  const providers = new Set(rows.map((row) => row.provider));

  return {
    github: providers.has("github"),
    google: providers.has("google"),
  };
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
    returning
      id,
      github_id,
      github_username,
      coalesce(nullif(display_name, ''), github_username) as display_name,
      email,
      email_verified_at,
      password_hash
  `;

  return user ?? null;
}

export async function markDashboardAccountEmailVerified(userId: string) {
  const sql = getSql();
  const [user] = await sql<DashboardAccount[]>`
    update users
    set email_verified_at = coalesce(email_verified_at, now()),
        updated_at = now()
    where id = ${userId}
    returning
      id,
      github_id,
      github_username,
      coalesce(nullif(display_name, ''), github_username) as display_name,
      email,
      email_verified_at,
      password_hash
  `;

  return user ?? null;
}

export async function updateDashboardAccountProfile(input: {
  userId: string;
  displayName: string;
}) {
  const displayName = normalizeDisplayName(input.displayName);
  if (!displayName) {
    throw new Error("Display name is required.");
  }
  if (displayName.length > 80) {
    throw new Error("Display name must be 80 characters or fewer.");
  }

  const sql = getSql();
  const [user] = await sql<DashboardAccount[]>`
    update users
    set display_name = ${displayName},
        updated_at = now()
    where id = ${input.userId}
    returning
      id,
      github_id,
      github_username,
      coalesce(nullif(display_name, ''), github_username) as display_name,
      email,
      email_verified_at,
      password_hash
  `;

  return user ?? null;
}
