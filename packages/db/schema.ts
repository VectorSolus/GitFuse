import {
  type AnyPgColumn,
  bigint,
  boolean,
  foreignKey,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid
} from "drizzle-orm/pg-core";

export const planTier = pgEnum("plan_tier", ["free", "pro", "team", "enterprise"]);
export const syncEventType = pgEnum("sync_event_type", ["sync", "pull", "drop", "undo", "rebase-sync"]);
export const bundleStatus = pgEnum("bundle_status", ["active", "superseded", "expired", "dropped"]);

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    githubId: text("github_id").notNull(),
    githubUsername: text("github_username").notNull(),
    email: text("email").notNull(),
    passwordHash: text("password_hash"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    githubIdUnique: unique("users_github_id_unique").on(table.githubId)
  })
);

export const devices = pgTable(
  "devices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    tokenHash: text("token_hash").notNull(),
    lastActiveAt: timestamp("last_active_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true })
  },
  (table) => ({
    tokenHashUnique: unique("devices_token_hash_unique").on(table.tokenHash),
    userIdIdx: index("devices_user_id_idx").on(table.userId)
  })
);

export const plans = pgTable(
  "plans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    tier: planTier("tier").notNull().default("free"),
    stripeCustomerId: text("stripe_customer_id"),
    stripeSubId: text("stripe_sub_id"),
    paymentProvider: text("payment_provider"),
    razorpayCustomerId: text("razorpay_customer_id"),
    razorpaySubscriptionId: text("razorpay_subscription_id"),
    razorpayPlanId: text("razorpay_plan_id"),
    requestedTier: planTier("requested_tier").notNull().default("free"),
    subscriptionStatus: text("subscription_status"),
    teamSeatCount: integer("team_seat_count").notNull().default(1),
    currentPeriodStart: timestamp("current_period_start", { withTimezone: true }),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
    cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    userIdUnique: unique("plans_user_id_unique").on(table.userId),
    razorpaySubscriptionIdUnique: unique("plans_razorpay_subscription_id_unique").on(
      table.razorpaySubscriptionId
    )
  })
);

export const repositories = pgTable(
  "repositories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    rootSha: text("root_sha").notNull(),
    displayName: text("display_name").notNull(),
    remoteUrl: text("remote_url"),
    relayEntryId: text("relay_entry_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true })
  },
  (table) => ({
    relayEntryIdUnique: unique("repositories_relay_entry_id_unique").on(table.relayEntryId),
    userRootShaUnique: unique("repositories_user_id_root_sha_unique").on(table.userId, table.rootSha),
    userIdIdx: index("repositories_user_id_idx").on(table.userId)
  })
);

export const syncEvents = pgTable(
  "sync_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    repositoryId: uuid("repository_id").notNull().references(() => repositories.id, { onDelete: "cascade" }),
    deviceId: uuid("device_id").notNull().references(() => devices.id, { onDelete: "cascade" }),
    eventType: syncEventType("event_type").notNull(),
    commitCount: integer("commit_count").notNull().default(0),
    bundleSizeBytes: bigint("bundle_size_bytes", { mode: "number" }).notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    repositoryCreatedIdx: index("sync_events_repository_created_idx").on(table.repositoryId, table.createdAt)
  })
);

export const syncEventCommits = pgTable(
  "sync_event_commits",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    syncEventId: uuid("sync_event_id").notNull().references(() => syncEvents.id, { onDelete: "cascade" }),
    repositoryId: uuid("repository_id").notNull().references(() => repositories.id, { onDelete: "cascade" }),
    sha: text("sha").notNull(),
    message: text("message").notNull(),
    authorName: text("author_name"),
    authorEmail: text("author_email"),
    authoredAt: timestamp("authored_at", { withTimezone: true }),
    committedAt: timestamp("committed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    syncEventIdx: index("sync_event_commits_sync_event_id_idx").on(table.syncEventId),
    repositoryIdx: index("sync_event_commits_repository_id_idx").on(table.repositoryId),
    repositoryCommittedIdx: index("sync_event_commits_repository_committed_idx").on(table.repositoryId, table.committedAt),
    syncEventShaUnique: unique("sync_event_commits_sync_event_sha_unique").on(table.syncEventId, table.sha)
  })
);

export const bundles = pgTable(
  "bundles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    repositoryId: uuid("repository_id").notNull().references(() => repositories.id, { onDelete: "cascade" }),
    deviceId: uuid("device_id").notNull().references(() => devices.id, { onDelete: "cascade" }),
    bundleHash: text("bundle_hash").notNull(),
    commitCount: integer("commit_count").notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
    r2Key: text("r2_key").notNull(),
    status: bundleStatus("status").notNull().default("active"),
    parentBundleId: uuid("parent_bundle_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull()
  },
  (table) => ({
    parentBundleFk: foreignKey({
      columns: [table.parentBundleId],
      foreignColumns: [table.id as AnyPgColumn],
      name: "bundles_parent_bundle_id_fk"
    }),
    repositoryStatusIdx: index("bundles_repository_status_idx").on(table.repositoryId, table.status),
    r2KeyUnique: unique("bundles_r2_key_unique").on(table.r2Key)
  })
);

export const cliAuthSessions = pgTable(
  "cli_auth_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: text("code").notNull(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    deviceName: text("device_name").notNull(),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    codeUnique: unique("cli_auth_sessions_code_unique").on(table.code)
  })
);

export const emailVerificationOtps = pgTable(
  "email_verification_otps",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    otpCode: text("otp_code").notNull(),
    purpose: text("purpose").notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    emailPurposeIdx: index("email_verification_otps_email_purpose_idx").on(table.email, table.purpose),
    userIdIdx: index("email_verification_otps_user_id_idx").on(table.userId)
  })
);
