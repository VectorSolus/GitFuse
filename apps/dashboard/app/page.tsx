"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ComponentType, FormEvent } from "react";

import { INSTALL_GUIDES, type InstallGuideKey } from "@/lib/install-commands";
import { EARLY_ACCESS_COPY, EARLY_ACCESS_PLAN_CARDS } from "@/lib/launch-mode";

const SoftAurora = dynamic(() => import("@/components/effects/SoftAurora"), {
  ssr: false,
}) as ComponentType<any>;

const features = [
  {
    label: "Encrypted relay",
    title: "Move WIP commits without publishing them",
    body: "Sync local commits privately between devices without pushing messy temporary work to GitHub.",
  },
  {
    label: "Git-native transport",
    title: "Preserve your exact history",
    body: "GitFuse keeps commit metadata, messages, authorship, file changes, and workflow context intact.",
  },
  {
    label: "Multi-device workflow",
    title: "Resume work from any machine",
    body: "Start on your laptop, continue on your desktop, and keep your development flow uninterrupted.",
  },
];

const comparisonRows = [
  ["Syncs commit objects", "Yes", "Manual push", "No"],
  ["Preserves commit history", "Yes", "Yes", "No"],
  ["Avoids public WIP pushes", "Yes", "No", "Partial"],
  ["Works across editors", "Yes", "Yes", "Limited"],
  ["Private relay", "Encrypted", "Remote repo", "Vendor cloud"],
];

export default function HomePage() {
  const router = useRouter();
  const [selectedInstall, setSelectedInstall] = useState<InstallGuideKey>("macos");
  const [heroEmail, setHeroEmail] = useState("");
  const currentGuide = INSTALL_GUIDES[selectedInstall];

  function handleHeroEmailSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedEmail = heroEmail.trim();

    if (!trimmedEmail) {
      router.push("/login");
      return;
    }

    router.push(`/login?email=${encodeURIComponent(trimmedEmail)}`);
  }

  return (
    <main className="gf-page">
      <div className="gf-bg">
        <div className="gf-soft-aurora">
          <SoftAurora
            speed={0.6}
            scale={1.5}
            brightness={1}
            color1="#0890f2"
            color2="#1f54dc"
            noiseFrequency={2.5}
            noiseAmplitude={1}
            bandHeight={0.5}
            bandSpread={1}
            octaveDecay={0.1}
            layerOffset={0}
            colorSpeed={1}
            enableMouseInteraction
            mouseInfluence={0.25}
          />
        </div>

        <div className="gf-bg-grid" />
        <div className="gf-bg-overlay" />
      </div>

      <header className="gf-header">
        <a href="/" className="gf-logo">
          Git<span>Fuse</span>
        </a>

        <nav className="gf-nav" aria-label="Main navigation">
          <a href="#features">Features</a>
          <a href="#compare">Compare</a>
          <a href="/docs">Docs</a>
          <a href="#pricing">Pricing</a>
          <a href="#install">Install</a>
        </nav>

        <a
          href="https://github.com/VectorSolus/GitFuse"
          className="gf-header-github-link gf-github-link"
          target="_blank"
          rel="noreferrer"
        >
          <span className="gf-github-link-text">View GitHub</span>
          <svg
            className="gf-github-link-arrow"
            viewBox="0 0 16 16"
            aria-hidden="true"
            focusable="false"
          >
            <path
              d="M5 11 11 5M6.5 5H11v4.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray="2 1.4"
            />
          </svg>
        </a>
      </header>

      <section className="gf-hero">
        <div className="gf-pill">
          <span className="gf-pill-dot" />
          {EARLY_ACCESS_COPY.availability} · CLI-first · private commit sync
        </div>

        <h1>
          Your commits,
          <span>everywhere.</span>
        </h1>

        <p className="gf-hero-subtitle">
          Sync local Git commits across every device without pushing messy WIP
          work to GitHub. GitFuse is available as Free Early Access while Pro
          and Team plans are Coming Soon.
        </p>

        <div className="gf-hero-cta-stack">
          <form
            className="gf-hero-email-form"
            onSubmit={handleHeroEmailSubmit}
          >
            <input
              type="email"
              placeholder="Enter your email"
              value={heroEmail}
              onChange={(event) => setHeroEmail(event.target.value)}
              aria-label="Email address"
            />

            <button type="submit" aria-label="Continue with email">
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                width="18"
                height="18"
              >
                <path
                  d="M5 12h13M13 6l6 6-6 6"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </form>

          <div className="gf-hero-actions">
            <a
              href="/login"
              className="gf-github-signin-button gf-auth-primary"
            >
              <span>Sign in</span>

              <span className="gf-provider-stack" aria-hidden="true">
                <span className="gf-provider-orb gf-provider-orb--github">
                  <svg
                    className="gf-provider-icon gf-provider-icon--github"
                    viewBox="0 0 24 24"
                  >
                    <path
                      fill="currentColor"
                      d="M12 0C5.37 0 0 5.5 0 12.3c0 5.44 3.44 10.05 8.2 11.68.6.12.82-.27.82-.59 0-.29-.01-1.06-.02-2.08-3.34.74-4.04-1.65-4.04-1.65-.55-1.42-1.34-1.8-1.34-1.8-1.09-.76.08-.75.08-.75 1.2.09 1.84 1.27 1.84 1.27 1.07 1.88 2.81 1.34 3.5 1.02.11-.79.42-1.34.76-1.64-2.67-.31-5.47-1.37-5.47-6.1 0-1.35.47-2.45 1.24-3.31-.12-.31-.54-1.57.12-3.26 0 0 1.01-.33 3.3 1.27A11.2 11.2 0 0 1 12 5.95c1.02 0 2.05.14 3.01.41 2.29-1.6 3.3-1.27 3.3-1.27.66 1.69.24 2.95.12 3.26.77.86 1.24 1.96 1.24 3.31 0 4.74-2.81 5.78-5.49 6.09.43.38.81 1.12.81 2.26 0 1.63-.01 2.95-.01 3.35 0 .33.22.72.83.59A12.25 12.25 0 0 0 24 12.3C24 5.5 18.63 0 12 0Z"
                    />
                  </svg>
                </span>
                <span className="gf-provider-orb gf-provider-orb--google">
                  <svg
                    className="gf-provider-icon gf-provider-icon--google"
                    viewBox="0 0 24 24"
                  >
                    <defs>
                      <clipPath id="gf-google-g-clip">
                        <path d="M12.48 10.92v3.28h7.84c-.24 1.88-.88 3.24-1.79 4.19-1.12 1.12-2.88 2.35-6.05 2.35-4.83 0-8.6-3.89-8.6-8.72s3.77-8.72 8.6-8.72c2.61 0 4.52 1.03 5.93 2.36l2.3-2.3C18.77 1.44 16.17 0 12.48 0 5.83 0 0 5.42 0 12.02s5.83 12.02 12.48 12.02c3.67 0 6.44-1.21 8.58-3.45 2.22-2.22 2.91-5.35 2.91-7.87 0-.78-.06-1.49-.17-2.1H12.48Z" />
                      </clipPath>
                    </defs>
                    <g clipPath="url(#gf-google-g-clip)">
                      <rect width="12" height="9" fill="#ea4335" />
                      <rect y="9" width="12" height="6" fill="#fbbc05" />
                      <rect y="15" width="12" height="9" fill="#34a853" />
                      <rect x="12" width="12" height="24" fill="#4285f4" />
                    </g>
                  </svg>
                </span>
                <span className="gf-provider-orb gf-provider-orb--mail">
                  <svg
                    className="gf-provider-icon gf-provider-icon--mail"
                    viewBox="0 0 24 24"
                    fill="none"
                  >
                    <path
                      d="M4.25 18V7.25"
                      stroke="#4285f4"
                      strokeWidth="3.5"
                      strokeLinecap="round"
                    />
                    <path
                      d="M19.75 7.25V18"
                      stroke="#34a853"
                      strokeWidth="3.5"
                      strokeLinecap="round"
                    />
                    <path
                      d="m4.4 7.1 7.6 5.7 7.6-5.7"
                      stroke="#ea4335"
                      strokeWidth="3.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="m17.25 8.86 2.35-1.76"
                      stroke="#fbbc04"
                      strokeWidth="3.5"
                      strokeLinecap="round"
                    />
                  </svg>
                </span>
              </span>
            </a>

            <a href="#install" className="gf-secondary-button">
              Install CLI
            </a>
          </div>
        </div>

        <div className="gf-hero-terminal" aria-label="GitFuse terminal preview">
          <div className="gf-terminal-top">
            <div>
              <span />
              <span />
              <span />
            </div>

            <p>gitfuse session handoff</p>
          </div>

          <div className="gf-terminal-body">
            <div>
              <p className="gf-terminal-muted"># laptop · end of session</p>

              <code>
                <span>$ git commit -m "auth middleware wired"</span>
                <span>$ gitfuse sync</span>
                <span className="gf-terminal-ok">✓ bundled 3 commits</span>
                <span className="gf-terminal-ok">✓ encrypted with device key</span>
                <span className="gf-terminal-ok">✓ synced to private relay</span>
              </code>
            </div>

            <div>
              <p className="gf-terminal-muted"># desktop · resume instantly</p>

              <code>
                <span>$ gitfuse pull</span>
                <span className="gf-terminal-ok">✓ fetched 3 commits</span>
                <span className="gf-terminal-ok">✓ replayed history</span>
                <span className="gf-terminal-ok">✓ HEAD → auth middleware wired</span>
                <span>$ git log --oneline</span>
              </code>
            </div>
          </div>
        </div>
      </section>

      <section id="features" className="gf-section">
        <div className="gf-section-heading">
          <p>Features</p>
          <h2>Designed for developers who move between machines.</h2>
        </div>

        <div className="gf-feature-grid">
          {features.map((feature) => (
            <article key={feature.title} className="gf-feature-card">
              <p>{feature.label}</p>
              <h3>{feature.title}</h3>
              <span>{feature.body}</span>
            </article>
          ))}
        </div>
      </section>

      <section id="compare" className="gf-section">
        <div className="gf-section-heading">
          <p>Comparison</p>
          <h2>No dashboard clutter. Just the product story.</h2>
        </div>

        <div className="gf-table-card">
          <div className="gf-table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Capability</th>
                  <th>GitFuse</th>
                  <th>GitHub Push</th>
                  <th>Cloud Changes</th>
                </tr>
              </thead>

              <tbody>
                {comparisonRows.map((row) => (
                  <tr key={row[0]}>
                    <td>{row[0]}</td>
                    <td>
                      <strong>{row[1]}</strong>
                    </td>
                    <td>{row[2]}</td>
                    <td>{row[3]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section id="pricing" className="gf-section">
        <div className="gf-section-heading">
          <p>Pricing</p>
          <h2>Free Early Access now. Paid plans are Coming Soon.</h2>
        </div>

        <div className="gf-pricing-grid">
          {EARLY_ACCESS_PLAN_CARDS.map((plan) => (
            <article
              key={plan.tier}
              className={`gf-plan ${
                plan.highlighted ? "gf-plan-featured" : ""
              }`}
            >
              {plan.highlighted ? (
                <div className="gf-popular">{plan.availability}</div>
              ) : null}

              <p>{plan.name}</p>
              <h3>{plan.priceLabel}</h3>
              <span className="gf-plan-availability">{plan.availability}</span>
              <span>{plan.description}</span>

              <ul>
                {plan.features.map((feature) => (
                  <li key={feature}>{feature}</li>
                ))}
              </ul>

              {plan.ctaEnabled && plan.ctaHref ? (
                <a href={plan.ctaHref}>{plan.ctaLabel}</a>
              ) : (
                <button type="button" disabled>
                  {plan.ctaLabel}
                </button>
              )}
            </article>
          ))}
        </div>
      </section>

      <section id="install" className="gf-section gf-install-section">
        <div className="gf-section-heading">
          <p>Install</p>
          <h2>Choose your operating system.</h2>
        </div>

        <div className="gf-install-tabs">
          {(Object.keys(INSTALL_GUIDES) as InstallGuideKey[]).map((key) => (
            <button
              key={key}
              type="button"
              className={selectedInstall === key ? "active" : ""}
              onClick={() => setSelectedInstall(key)}
            >
              {INSTALL_GUIDES[key].label}
            </button>
          ))}
        </div>

        <div key={selectedInstall} className="gf-install-card">
          <div className="gf-terminal-top">
            <div>
              <span />
              <span />
              <span />
            </div>

            <p>{currentGuide.shell}</p>
          </div>

          <pre>
            <code>
              {currentGuide.commands.map((line) => (
                <span key={line}>
                  <em>$</em> {line}
                </span>
              ))}
            </code>
          </pre>
        </div>
      </section>

      <footer className="gf-footer">
        <p>
          Git<span>Fuse</span>
        </p>

        <div>
          <a href="#features">Features</a>
          <a href="/docs">Docs</a>
          <a href="#pricing">Pricing</a>
          <a href="/login">Sign in</a>
        </div>
      </footer>
    </main>
  );
}
