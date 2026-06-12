"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { signOut } from "next-auth/react";
import type { FormEvent } from "react";

import { useDashboardData, type DashboardData } from "@/hooks/use-dashboard-data";
import { deleteCurrentAccountAction } from "./actions";

type SettingsSection =
  | "Profile"
  | "Authentication"
  | "Security"
  | "Billing"
  | "API access"
  | "Danger zone";

type AddEmailStep = "email" | "password" | "otp";

type BillingLimit = {
  label: string;
  value: string;
  helper: string;
  tone: "ocean" | "green" | "violet" | "amber";
};

const settingsSections: SettingsSection[] = [
  "Profile",
  "Authentication",
  "Security",
  "Billing",
  "API access",
  "Danger zone",
];

function getSettingsSectionFromQuery(value: string | null): SettingsSection | null {
  if (!value) return null;

  const normalized = value.toLowerCase();

  if (normalized === "profile") return "Profile";
  if (normalized === "authentication") return "Authentication";
  if (normalized === "security") return "Security";
  if (normalized === "billing") return "Billing";
  if (normalized === "api-access" || normalized === "api") return "API access";
  if (normalized === "danger-zone" || normalized === "danger") return "Danger zone";

  return null;
}

export default function SettingsPage() {
  const searchParams = useSearchParams();
  const { data } = useDashboardData();
  const accountEmail = data?.user.email ?? "";
  const displayName = data?.user.name || "GitFuse";
  const connectedEmails = accountEmail
    ? [
        {
          email: accountEmail,
          status: "Primary",
        },
      ]
    : [];
  const billingLimits = buildBillingLimits(data);

  const [selectedSection, setSelectedSection] = useState<SettingsSection>(() => {
    return getSettingsSectionFromQuery(searchParams.get("section")) ?? "Profile";
  });

  const [addEmailOpen, setAddEmailOpen] = useState(false);
  const [billingOpen, setBillingOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  useEffect(() => {
    const section = getSettingsSectionFromQuery(searchParams.get("section"));

    if (section) {
      setSelectedSection(section);
    }
  }, [searchParams]);

  return (
    <div className="gf-settings-v3">
      <aside className="gf-settings-v3-nav">
        <p>Settings</p>

        <nav aria-label="Settings sections">
          {settingsSections.map((section) => (
            <button
              key={section}
              type="button"
              className={selectedSection === section ? "active" : ""}
              onClick={() => setSelectedSection(section)}
            >
              {section}
            </button>
          ))}
        </nav>
      </aside>

      <section className="gf-settings-v3-main">
        {selectedSection === "Profile" ? (
          <ProfileSection displayName={displayName} accountEmail={accountEmail} />
        ) : null}

        {selectedSection === "Authentication" ? (
          <AuthenticationSection
            connectedEmails={connectedEmails}
            onAddEmail={() => setAddEmailOpen(true)}
          />
        ) : null}

        {selectedSection === "Security" ? <SecuritySection /> : null}

        {selectedSection === "Billing" ? (
          <BillingSection
            billingLimits={billingLimits}
            tier={data?.billing.tier ?? "free"}
            onOpenBilling={() => setBillingOpen(true)}
          />
        ) : null}

        {selectedSection === "API access" ? <ApiAccessSection /> : null}

        {selectedSection === "Danger zone" ? (
          <DangerZoneSection onDelete={() => setDeleteOpen(true)} />
        ) : null}
      </section>

      {addEmailOpen ? (
        <AddEmailModal onClose={() => setAddEmailOpen(false)} />
      ) : null}

      {billingOpen ? (
        <BillingModal
          billingLimits={billingLimits}
          tier={data?.billing.tier ?? "free"}
          onClose={() => setBillingOpen(false)}
        />
      ) : null}

      {deleteOpen ? (
        <DeleteAccountModal
          email={accountEmail}
          onClose={() => setDeleteOpen(false)}
        />
      ) : null}
    </div>
  );
}

function ProfileSection({
  displayName,
  accountEmail,
}: {
  displayName: string;
  accountEmail: string;
}) {
  return (
    <>
      <section className="gf-settings-v3-hero">
        <p className="gf-dash-eyebrow">Profile</p>
        <h2>Manage your GitFuse workspace identity.</h2>
        <span>
          This profile is independent from GitHub. Authentication can come from
          GitHub, Google, or email, but your GitFuse workspace identity stays
          managed here.
        </span>
      </section>

      <section className="gf-settings-v3-panel">
        <div className="gf-settings-v3-panel-head">
          <div>
            <p className="gf-dash-eyebrow">Workspace profile</p>
            <h3>Public dashboard details</h3>
          </div>

          <button type="button">Save changes</button>
        </div>

        <div className="gf-settings-v3-form-grid">
          <label>
            Display name
            <input key={displayName} defaultValue={displayName} />
          </label>

          <label>
            Primary email
            <input key={accountEmail} defaultValue={accountEmail} />
          </label>
        </div>

        <div className="gf-settings-v3-note">
          Profile changes affect your GitFuse dashboard only. They do not edit
          your GitHub or Google account profile.
        </div>
      </section>
    </>
  );
}

function AuthenticationSection({
  connectedEmails,
  onAddEmail,
}: {
  connectedEmails: { email: string; status: string }[];
  onAddEmail: () => void;
}) {
  return (
    <>
      <section className="gf-settings-v3-hero">
        <p className="gf-dash-eyebrow">Authentication</p>
        <h2>Control how you sign in to GitFuse.</h2>
        <span>
          Add recovery emails, connect OAuth providers, and prepare additional
          sign-in methods without changing your workspace data.
        </span>
      </section>

      <section className="gf-settings-v3-panel">
        <div className="gf-settings-v3-panel-head">
          <div>
            <p className="gf-dash-eyebrow">Emails</p>
            <h3>Connected email addresses</h3>
          </div>

          <button type="button" onClick={onAddEmail}>
            Add email
          </button>
        </div>

        <div className="gf-settings-v3-list">
          {connectedEmails.map((item) => (
            <div key={item.email}>
              <div>
                <strong>{item.email}</strong>
                <span>Email sign-in and account recovery</span>
              </div>

              <em>{item.status}</em>
            </div>
          ))}
        </div>
      </section>

      <section className="gf-settings-v3-panel">
        <div className="gf-settings-v3-panel-head">
          <div>
            <p className="gf-dash-eyebrow">OAuth</p>
            <h3>Connected sign-in providers</h3>
          </div>
        </div>

        <div className="gf-settings-v3-list">
          <div>
            <div>
              <strong>GitHub OAuth</strong>
              <span>Used for GitHub-based authentication.</span>
            </div>

            <em>Connected</em>
          </div>

          <div>
            <div>
              <strong>Google OAuth</strong>
              <span>Available for Google-based authentication.</span>
            </div>

            <em>Available</em>
          </div>
        </div>
      </section>
    </>
  );
}

function SecuritySection() {
  return (
    <>
      <section className="gf-settings-v3-hero">
        <p className="gf-dash-eyebrow">Security</p>
        <h2>Protect access to your private sync workspace.</h2>
        <span>
          Security controls will cover two-step verification, device sessions,
          account recovery, and sensitive action confirmations.
        </span>
      </section>

      <section className="gf-settings-v3-panel">
        <div className="gf-settings-v3-panel-head">
          <div>
            <p className="gf-dash-eyebrow">Two-step verification</p>
            <h3>2FA is upcoming</h3>
          </div>

          <button type="button" disabled>
            Upcoming
          </button>
        </div>

        <div className="gf-settings-v3-upcoming-card">
          <strong>Two-step verification is not active yet.</strong>
          <span>
            This will later protect dashboard login, sensitive account changes,
            billing actions, and API key access.
          </span>
        </div>
      </section>

      <section className="gf-settings-v3-panel">
        <div className="gf-settings-v3-panel-head">
          <div>
            <p className="gf-dash-eyebrow">Sessions</p>
            <h3>Trusted browser sessions</h3>
          </div>
        </div>

        <div className="gf-settings-v3-list">
          <div>
            <div>
              <strong>Current browser</strong>
              <span>Local development session</span>
            </div>

            <em>Active</em>
          </div>
        </div>
      </section>
    </>
  );
}

function BillingSection({
  billingLimits,
  tier,
  onOpenBilling,
}: {
  billingLimits: BillingLimit[];
  tier: string;
  onOpenBilling: () => void;
}) {
  return (
    <>
      <section className="gf-settings-v3-hero">
        <p className="gf-dash-eyebrow">Billing</p>
        <h2>Manage plan limits without clutter.</h2>
        <span>
          Your current workspace is on the {tier} tier. Stripe checkout and
          invoices can be connected from the upgrade flow when configured.
        </span>
      </section>

      <section className="gf-settings-v3-panel">
        <div className="gf-settings-v3-panel-head">
          <div>
            <p className="gf-dash-eyebrow">Current plan</p>
            <h3>{titleCase(tier)} workspace</h3>
          </div>

          <button type="button" onClick={onOpenBilling}>
            View billing
          </button>
        </div>

        <div className="gf-settings-billing-summary">
          <div>
            <strong>{titleCase(tier)} plan</strong>
            <span>Active workspace plan</span>
          </div>

          <em>Active</em>
        </div>

        <div className="gf-settings-billing-tiles">
          {billingLimits.map((limit) => (
            <article
              key={limit.label}
              className={`gf-settings-billing-tile gf-settings-billing-tile-${limit.tone}`}
            >
              <p>{limit.label}</p>
              <strong>{limit.value}</strong>
              <span>{limit.helper}</span>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}

function ApiAccessSection() {
  return (
    <>
      <section className="gf-settings-v3-hero">
        <p className="gf-dash-eyebrow">API access</p>
        <h2>Create repository-scoped access later.</h2>
        <span>
          API keys will be scoped to selected repositories only, not the entire
          GitFuse account.
        </span>
      </section>

      <section className="gf-settings-v3-panel">
        <div className="gf-settings-v3-panel-head">
          <div>
            <p className="gf-dash-eyebrow">API keys</p>
            <h3>Repository-scoped keys</h3>
          </div>

          <button type="button" disabled>
            Upcoming
          </button>
        </div>

        <div className="gf-settings-v3-upcoming-card">
          <strong>No API keys yet.</strong>
          <span>
            Upcoming versions can allow external tools to access a specific
            repository without granting access to every workspace repo.
          </span>
        </div>
      </section>
    </>
  );
}

function DangerZoneSection({ onDelete }: { onDelete: () => void }) {
  return (
    <>
      <section className="gf-settings-v3-hero gf-settings-v3-danger-hero">
        <p className="gf-dash-eyebrow">Danger zone</p>
        <h2>High-impact account actions.</h2>
        <span>
          Delete controls are separated from normal settings and require email
          confirmation before continuing.
        </span>
      </section>

      <section className="gf-settings-v3-panel gf-settings-v3-danger-panel">
        <div className="gf-settings-v3-panel-head">
          <div>
            <p className="gf-dash-eyebrow">Delete account</p>
            <h3>Permanent account deletion</h3>
          </div>

          <button
            type="button"
            className="gf-settings-delete-button"
            onClick={onDelete}
          >
            Delete account
          </button>
        </div>

        <div className="gf-settings-danger-grid">
          <article>
            <strong>Account profile</strong>
            <span>Your GitFuse account profile and dashboard identity.</span>
          </article>

          <article>
            <strong>Connected emails</strong>
            <span>Email sign-in methods linked to this account.</span>
          </article>

          <article>
            <strong>Workspace access</strong>
            <span>Dashboard access, trusted devices, and future API keys.</span>
          </article>

          <article>
            <strong>Billing connection</strong>
            <span>Plan metadata and future billing links.</span>
          </article>
        </div>

        <div className="gf-settings-v3-upcoming-card gf-settings-danger-warning">
          <strong>This action should be treated as permanent.</strong>
          <span>
            Deleting your account removes dashboard records and signs this
            browser out after confirmation.
          </span>
        </div>
      </section>
    </>
  );
}

function AddEmailModal({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState<AddEmailStep>("email");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [feedback, setFeedback] = useState("");
  const [pending, setPending] = useState(false);

  const stepIndex = useMemo(() => {
    if (step === "email") return 0;
    if (step === "password") return 1;
    return 2;
  }, [step]);

  function handleEmailSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!email.trim()) return;
    setStep("password");
  }

  async function handlePasswordSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (password.length < 8) return;
    setPending(true);
    setFeedback("");

    try {
      const response = await fetch("/api/auth/otp/request", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password, purpose: "add_email" }),
      });

      if (!response.ok) throw new Error("Could not send verification code.");
      setStep("otp");
      setFeedback("Verification code sent.");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Could not send verification code.");
    } finally {
      setPending(false);
    }
  }

  async function handleOtpSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (otp.length !== 6) return;
    setPending(true);
    setFeedback("");

    try {
      const response = await fetch("/api/auth/otp/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, code: otp, purpose: "add_email" }),
      });

      if (!response.ok) throw new Error("Verification code is invalid or expired.");
      onClose();
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Verification code is invalid or expired.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="gf-add-email-modal" role="dialog" aria-modal="true">
      <div className="gf-add-email-backdrop" onClick={onClose} />

      <section className="gf-add-email-card">
        <button
          type="button"
          className="gf-add-email-close"
          onClick={onClose}
          aria-label="Close add email"
        >
          <CloseIcon />
        </button>

        <div className="gf-add-email-slider">
          <div
            className="gf-add-email-track"
            style={{ transform: `translateX(-${stepIndex * 100}%)` }}
          >
            <form className="gf-add-email-screen" onSubmit={handleEmailSubmit}>
              <p className="gf-dash-eyebrow">Add email</p>
              <h2>Connect another sign-in email.</h2>
              <span>
                Enter the email address you want to add to this GitFuse account.
              </span>

              <label className="gf-add-email-field">
                Email address
                <div>
                  <MailIcon />
                  <input
                    type="email"
                    value={email}
                    placeholder="you@example.com"
                    onChange={(event) => setEmail(event.target.value)}
                    autoFocus
                  />

                  <button type="submit" aria-label="Continue to password">
                    <ArrowIcon />
                  </button>
                </div>
              </label>

              <SocialDivider />
              <SocialButtons />
              <StepPips active={stepIndex} />
            </form>

            <form
              className="gf-add-email-screen"
              onSubmit={handlePasswordSubmit}
            >
              <p className="gf-dash-eyebrow">Set password</p>
              <h2>Create a password for this email.</h2>
              <span>
                This keeps email sign-in ready while GitHub and Google remain
                optional providers.
              </span>

              <label className="gf-add-email-field">
                Email address
                <div>
                  <MailIcon />
                  <input
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                  />
                </div>
              </label>

              <label className="gf-add-email-field">
                New password
                <div>
                  <LockIcon />
                  <input
                    type="password"
                    value={password}
                    placeholder="Minimum 8 characters"
                    onChange={(event) => setPassword(event.target.value)}
                    autoFocus
                  />

                  <button type="submit" aria-label="Continue to OTP">
                    <ArrowIcon />
                  </button>
                </div>
              </label>

              <SocialDivider />
              <SocialButtons />
              <StepPips active={stepIndex} />
            </form>

            <form className="gf-add-email-screen" onSubmit={handleOtpSubmit}>
              <p className="gf-dash-eyebrow">Verify email</p>
              <h2>Enter the OTP sent to your inbox.</h2>
              <span>
                We sent a verification code to <strong>{email}</strong>.
              </span>
              {feedback ? <span>{feedback}</span> : null}

              <label className="gf-add-email-field">
                OTP code
                <div>
                  <ShieldIcon />
                  <input
                    inputMode="numeric"
                    placeholder="000000"
                    maxLength={6}
                    value={otp}
                    onChange={(event) => setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))}
                    autoFocus
                  />

                  <button type="submit" aria-label="Verify email" disabled={pending}>
                    <ArrowIcon />
                  </button>
                </div>
              </label>

              <button
                type="button"
                className="gf-add-email-secondary"
                onClick={() => setStep("password")}
              >
                Change email or password
              </button>

              <StepPips active={stepIndex} />
            </form>
          </div>
        </div>
      </section>
    </div>
  );
}

function DeleteAccountModal({
  email,
  onClose,
}: {
  email: string;
  onClose: () => void;
}) {
  const [confirmationEmail, setConfirmationEmail] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const canDelete =
    confirmationEmail.trim().toLowerCase() === email.toLowerCase();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canDelete || pending) {
      setError("Email confirmation does not match this account.");
      return;
    }

    setPending(true);
    setError("");

    const result = await deleteCurrentAccountAction({ confirmationEmail });

    if (!result.ok) {
      setPending(false);
      setError(result.error ?? "Could not delete account. Please try again.");
      return;
    }

    await signOut({ callbackUrl: result.redirectTo ?? "/" });
  }

  return (
    <div className="gf-delete-account-modal" role="dialog" aria-modal="true">
      <div className="gf-delete-account-backdrop" onClick={onClose} />

      <form className="gf-delete-account-card" onSubmit={handleSubmit}>
        <button
          type="button"
          className="gf-delete-account-close"
          onClick={onClose}
          aria-label="Close delete account"
        >
          <CloseIcon />
        </button>

        <p className="gf-dash-eyebrow">Delete account</p>
        <h2>Confirm account deletion.</h2>
        <span>
          Enter your email address to confirm this action:
          <strong> {email}</strong>
        </span>

        <label className="gf-delete-account-field">
          Confirmation email
          <input
            type="email"
            value={confirmationEmail}
            placeholder={email}
            onChange={(event) => {
              setConfirmationEmail(event.target.value);
              setError("");
            }}
            autoFocus
          />
        </label>

        {error ? <span>{error}</span> : null}

        <div className="gf-delete-account-actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>

          <button type="submit" disabled={!canDelete || pending}>
            {pending ? "Deleting..." : "Delete account"}
          </button>
        </div>
      </form>
    </div>
  );
}

function BillingModal({
  billingLimits,
  tier,
  onClose,
}: {
  billingLimits: BillingLimit[];
  tier: string;
  onClose: () => void;
}) {
  return (
    <div className="gf-settings-billing-modal" role="dialog" aria-modal="true">
      <div className="gf-settings-billing-backdrop" onClick={onClose} />

      <section className="gf-settings-billing-card">
        <button
          type="button"
          className="gf-settings-billing-close"
          onClick={onClose}
          aria-label="Close billing"
        >
          <CloseIcon />
        </button>

        <p className="gf-dash-eyebrow">Billing</p>
        <h2>{titleCase(tier)} workspace</h2>
        <span>
          Billing is ready as a frontend view. Stripe checkout, invoices, and
          live plan changes can be connected later.
        </span>

        <div className="gf-settings-billing-mini-grid">
          {billingLimits.map((limit) => (
            <div key={limit.label}>
              <strong>{limit.value}</strong>
              <span>{limit.label}</span>
            </div>
          ))}
        </div>

        <div className="gf-settings-upgrade-tile">
          <div>
            <p>Upgrade path</p>
            <strong>Need more workspace capacity?</strong>
            <span>
              Open the upgrade page to review larger limits, longer history, and
              more private repository capacity.
            </span>
          </div>

          <Link href="/dashboard/upgrade" target="_blank" rel="noreferrer">
            Upgrade
            <ExternalArrowIcon />
          </Link>
        </div>
      </section>
    </div>
  );
}

function buildBillingLimits(data: DashboardData | null): BillingLimit[] {
  return [
    {
      label: "Repositories",
      value: formatLimit(data?.usage.repos.max ?? 5),
      helper: "tracked repositories",
      tone: "ocean",
    },
    {
      label: "Devices",
      value: formatLimit(data?.usage.devices.max ?? 3),
      helper: "trusted machines",
      tone: "green",
    },
    {
      label: "Storage",
      value: formatBytes(data?.usage.storage.maxBytes ?? 500 * 1024 * 1024),
      helper: "private relay storage",
      tone: "violet",
    },
    {
      label: "History",
      value: `${data?.usage.historyDays ?? 30} days`,
      helper: "sync history retention",
      tone: "amber",
    },
  ];
}

function formatLimit(value: number | "unlimited") {
  return value === "unlimited" ? "Unlimited" : String(value);
}

function formatBytes(bytes: number) {
  if (bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let index = 0;

  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }

  return `${value >= 10 || index === 0 ? Math.round(value) : value.toFixed(1)} ${units[index]}`;
}

function titleCase(value: string) {
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}

function SocialDivider() {
  return (
    <div className="gf-add-email-divider">
      <span />
      <strong>or continue with</strong>
      <span />
    </div>
  );
}

function SocialButtons() {
  return (
    <div className="gf-add-email-socials">
      <button type="button">
        <GoogleIcon />
        Sign in with Google
      </button>

      <button type="button">
        <GithubIcon />
        Sign in with GitHub
      </button>
    </div>
  );
}

function StepPips({ active }: { active: number }) {
  return (
    <div className="gf-add-email-pips" aria-label="Add email progress">
      {[0, 1, 2].map((index) => (
        <span key={index} className={active === index ? "active" : ""} />
      ))}
    </div>
  );
}

function MailIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 6h16v12H4V6Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="M4 7l8 6 8-6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect
        x="5"
        y="10"
        width="14"
        height="10"
        rx="3"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M8 10V7a4 4 0 0 1 8 0v3"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 3l7 3v5c0 5-3 8.5-7 10-4-1.5-7-5-7-10V6l7-3Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="M9 12l2 2 4-5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M5 12h14M13 6l6 6-6 6"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ExternalArrowIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M7 17L17 7"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <path
        d="M9 7h8v8"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M6 6l12 12M18 6L6 18"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M21.6 12.23c0-.77-.07-1.5-.2-2.2H12v4.17h5.38a4.6 4.6 0 0 1-2 3.02v2.5h3.23c1.9-1.74 2.99-4.32 2.99-7.49Z"
      />
      <path
        fill="#34A853"
        d="M12 22c2.7 0 4.97-.9 6.62-2.43l-3.23-2.5c-.9.6-2.05.96-3.39.96-2.6 0-4.8-1.76-5.59-4.12H3.08v2.58A10 10 0 0 0 12 22Z"
      />
      <path
        fill="#FBBC05"
        d="M6.41 13.91A6 6 0 0 1 6.1 12c0-.66.11-1.3.31-1.91V7.51H3.08A10 10 0 0 0 2 12c0 1.61.39 3.14 1.08 4.49l3.33-2.58Z"
      />
      <path
        fill="#EA4335"
        d="M12 5.97c1.47 0 2.78.5 3.82 1.49l2.87-2.87C16.96 2.98 14.7 2 12 2a10 10 0 0 0-8.92 5.51l3.33 2.58C7.2 7.73 9.4 5.97 12 5.97Z"
      />
    </svg>
  );
}

function GithubIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 .5a12 12 0 0 0-3.8 23.38c.6.11.82-.26.82-.58v-2.03c-3.34.73-4.04-1.42-4.04-1.42-.55-1.39-1.34-1.76-1.34-1.76-1.1-.75.08-.74.08-.74 1.21.09 1.85 1.25 1.85 1.25 1.08 1.84 2.83 1.31 3.52 1 .11-.78.42-1.31.76-1.61-2.67-.3-5.47-1.33-5.47-5.93 0-1.31.47-2.38 1.24-3.22-.12-.3-.54-1.53.12-3.18 0 0 1.01-.32 3.3 1.23a11.5 11.5 0 0 1 6 0c2.29-1.55 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.77.84 1.24 1.91 1.24 3.22 0 4.61-2.81 5.63-5.49 5.93.43.37.81 1.1.81 2.22v3.29c0 .32.22.7.83.58A12 12 0 0 0 12 .5Z" />
    </svg>
  );
}
