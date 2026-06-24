import type { PlanTier } from "./billing";

export type Device = {
  id: string;
  userId: string;
  name: string;
  publicKeyFingerprint?: string | null;
  firstSyncedAt?: string | null;
  lastSyncedAt?: string | null;
  lastActiveAt: string | null;
  createdAt: string;
  revokedAt: string | null;
};

export type Repository = {
  id: string;
  userId: string;
  rootSha: string;
  displayName: string;
  remoteUrl: string | null;
  relayEntryId: string;
  createdAt: string;
  lastSyncedAt: string | null;
};

export type SyncEventType = "sync" | "pull" | "drop" | "undo" | "rebase-sync";

export type SyncEvent = {
  id: string;
  repositoryId: string;
  deviceId: string;
  eventType: SyncEventType;
  commitCount: number;
  bundleSizeBytes: number;
  createdAt: string;
};

export type BundleStatus = "active" | "superseded" | "expired" | "dropped";

export type Bundle = {
  id: string;
  repositoryId: string;
  deviceId: string;
  bundleHash: string;
  commitCount: number;
  sizeBytes: number;
  r2Key: string;
  status: BundleStatus;
  parentBundleId: string | null;
  createdAt: string;
  expiresAt: string;
};

export type AccountPlan = {
  userId: string;
  tier: PlanTier;
  currentPeriodEnd: string | null;
};
