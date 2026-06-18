import type { LimitName, UsageSummary } from "./billing";
import type { Bundle, Device, Repository } from "./workspace";

export type SessionExpiredError = {
  error: "SESSION_EXPIRED";
  message: "Session expired. Run 'gitfuse auth' to re-authenticate. Your local changes are safe — nothing was lost.";
};

export type OverLimitError = {
  error: "OVER_LIMIT";
  limit: LimitName;
  current: number;
  max: number;
};

export type BundleRejectedReason = "VERSION_MISMATCH" | "CORRUPT" | "HASH_MISMATCH";

export type BundleRejectedError = {
  error: "BUNDLE_REJECTED";
  reason: BundleRejectedReason;
  relay_min_version: string;
};

export type RelayError =
  | SessionExpiredError
  | OverLimitError
  | BundleRejectedError
  | { error: "NOT_FOUND"; message: string }
  | { error: "CONFLICT"; message: string }
  | { error: "BAD_REQUEST"; message: string };

export type RegisterDeviceRequest = {
  code: string;
  deviceName: string;
  deviceId?: string;
};

export type RegisterDeviceResponse = {
  code: string;
  expiresAt: string;
};

export type ApproveAuthRequest = {
  code: string;
  githubUsername: string;
  email?: string;
  deviceId?: string;
};

export type PollAuthResponse = {
  approved: boolean;
  token?: string;
  username?: string;
  deviceId?: string;
};

export type CreateRepoRequest = {
  rootSha: string;
  displayName: string;
  remoteUrl?: string | null;
};

export type CreateRepoResponse = {
  repository: Repository;
};

export type ListReposResponse = {
  repositories: Repository[];
};

export type UploadBundleMetadata = {
  relayEntryId: string;
  bundleHash: string;
  commitCount: number;
  sizeBytes: number;
  parentBundleId?: string | null;
  commits?: SyncedCommit[];
};

export type SyncedCommit = {
  sha: string;
  message: string;
  authorName: string | null;
  authorEmail: string | null;
  authoredAt: string | null;
  committedAt: string | null;
};

export type UploadBundleResponse = {
  bundle: Bundle;
};

export type ListBundlesResponse = {
  bundles: Bundle[];
};

export type ListDevicesResponse = {
  devices: Device[];
};

export type UsageResponse = UsageSummary;
