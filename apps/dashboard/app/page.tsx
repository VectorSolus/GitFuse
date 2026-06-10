"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import type { ComponentType } from "react";

const SoftAurora = dynamic(() => import("@/components/effects/SoftAurora"), {
  ssr: false,
}) as ComponentType<any>;

type InstallKey = "macos" | "windows" | "linux";

const installGuides: Record<
  InstallKey,
  {
    label: string;
    shell: string;
    lines: string[];
  }
> = {
  macos: {
    label: "macOS",
    shell: "zsh",
    lines: [
      "brew install gitfuse",
      "gitfuse auth login",
      "gitfuse add .",
      "gitfuse sync",
    ],
  },
  windows: {
    label: "Windows",
    shell: "PowerShell",
    lines: [
      "winget install gitfuse",
      "gitfuse auth login",
      "gitfuse add .",
      "gitfuse sync",
    ],
  },
  linux: {
    label: "Linux",
    shell: "bash / zsh",
    lines: [
      "curl -fsSL https://install.gitfuse.dev | sh",
      "gitfuse auth login",
      "gitfuse add .",
      "gitfuse sync",
    ],
  },
};

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
  const [selectedInstall, setSelectedInstall] = useState<InstallKey>("macos");
  const currentGuide = installGuides[selectedInstall];

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
          <a href="#pricing">Pricing</a>
          <a href="#install">Install</a>
        </nav>

        <div className="gf-header-actions">
          <a href="/login" className="gf-link-button">
            Sign in
          </a>
          <a href="/login" className="gf-primary-small">
            Start free
          </a>
        </div>
      </header>

      <section className="gf-hero">
        <div className="gf-pill">
          <span className="gf-pill-dot" />
          Open source · CLI-first · private commit sync
        </div>

        <h1>
          Your commits,
          <span>everywhere.</span>
        </h1>

        <p className="gf-hero-subtitle">
          Sync local Git commits across every device without pushing messy WIP
          work to GitHub. Pick up exactly where you left off with a polished,
          private, ocean-blue developer workflow.
        </p>

        <div className="gf-hero-actions">
          <a href="/login" className="gf-primary-button">
            Sign in with GitHub
          </a>
          <a href="#install" className="gf-secondary-button">
            Install CLI
          </a>
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
          <h2>Simple pricing for individuals and teams.</h2>
        </div>

        <div className="gf-pricing-grid">
          <article className="gf-plan">
            <p>Free</p>
            <h3>$0</h3>
            <span>For individual developers getting started.</span>
            <ul>
              <li>3 devices</li>
              <li>5 repositories</li>
              <li>30-day sync history</li>
            </ul>
            <a href="/login">Start free</a>
          </article>

          <article className="gf-plan gf-plan-featured">
            <div className="gf-popular">Popular</div>
            <p>Pro</p>
            <h3>$9/mo</h3>
            <span>For developers working across several machines daily.</span>
            <ul>
              <li>Unlimited devices</li>
              <li>Unlimited repositories</li>
              <li>Priority relay speed</li>
            </ul>
            <a href="/login">Start Pro</a>
          </article>

          <article className="gf-plan">
            <p>Team</p>
            <h3>$18/user</h3>
            <span>For teams that need visibility and access controls.</span>
            <ul>
              <li>Team dashboard</li>
              <li>Per-repo controls</li>
              <li>Audit history</li>
            </ul>
            <a href="/login">Start team</a>
          </article>
        </div>
      </section>

      <section id="install" className="gf-section gf-install-section">
        <div className="gf-section-heading">
          <p>Install</p>
          <h2>Choose your operating system.</h2>
        </div>

        <div className="gf-install-tabs">
          {(Object.keys(installGuides) as InstallKey[]).map((key) => (
            <button
              key={key}
              type="button"
              className={selectedInstall === key ? "active" : ""}
              onClick={() => setSelectedInstall(key)}
            >
              {installGuides[key].label}
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
              {currentGuide.lines.map((line) => (
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
          <a href="#pricing">Pricing</a>
          <a href="/login">Sign in</a>
        </div>
      </footer>
    </main>
  );
}