"use client";

import dynamic from "next/dynamic";
import type { ComponentType } from "react";

const SoftAurora = dynamic(() => import("@/components/effects/SoftAurora"), {
  ssr: false,
}) as ComponentType<any>;

const commandSections = [
  {
    id: "quick-start",
    title: "Quick start",
    description:
      "Install GitFuse, authenticate your device, add your current repository, and sync your first local commits.",
    commands: [
      {
        label: "Install on macOS",
        code: "brew install gitfuse",
      },
      {
        label: "Authenticate this device",
        code: "gitfuse auth login",
      },
      {
        label: "Track the current repository",
        code: "gitfuse add .",
      },
      {
        label: "Sync local commits",
        code: "gitfuse sync",
      },
    ],
  },
  {
    id: "auth",
    title: "Authentication",
    description:
      "GitFuse uses GitHub for authentication, but your GitFuse dashboard account and sync workspace remain independent.",
    commands: [
      {
        label: "Start login flow",
        code: "gitfuse auth login",
      },
      {
        label: "Show current account",
        code: "gitfuse auth status",
      },
      {
        label: "Logout from this device",
        code: "gitfuse auth logout",
      },
    ],
  },
  {
    id: "repositories",
    title: "Repositories",
    description:
      "Register repositories into your GitFuse workspace and switch between them without changing directories.",
    commands: [
      {
        label: "Add current repository",
        code: "gitfuse add .",
      },
      {
        label: "Add repository by path",
        code: "gitfuse add ~/Projects/api-gateway",
      },
      {
        label: "List tracked repositories",
        code: "gitfuse repos",
      },
      {
        label: "Use a repository context",
        code: "gitfuse use api-gateway",
      },
      {
        label: "Stop tracking a repository",
        code: "gitfuse forget api-gateway",
      },
    ],
  },
  {
    id: "sync",
    title: "Sync workflow",
    description:
      "Sync your local commit objects to the private relay and pull them on another device when you continue work.",
    commands: [
      {
        label: "Sync all unsynced local commits",
        code: "gitfuse sync",
      },
      {
        label: "Pull synced commits on another device",
        code: "gitfuse pull",
      },
      {
        label: "Sync a commit range",
        code: "gitfuse sync HEAD~3..HEAD",
      },
      {
        label: "Sync every tracked repository",
        code: "gitfuse sync --all",
      },
      {
        label: "Pull every tracked repository",
        code: "gitfuse pull --all",
      },
    ],
  },
  {
    id: "status",
    title: "Status and history",
    description:
      "Inspect what has synced, what is waiting on the relay, and which device last updated a repository.",
    commands: [
      {
        label: "Show active repository status",
        code: "gitfuse status",
      },
      {
        label: "Show all repository states",
        code: "gitfuse status --all",
      },
      {
        label: "Show sync history",
        code: "gitfuse log",
      },
      {
        label: "Show sync history for one repository",
        code: "gitfuse log api-gateway",
      },
    ],
  },
  {
    id: "auto-sync",
    title: "Auto sync",
    description:
      "Use auto sync when you want GitFuse to sync quietly after local commits are created.",
    commands: [
      {
        label: "Enable auto sync",
        code: "gitfuse start --auto",
      },
      {
        label: "Enable auto sync with delay",
        code: "gitfuse start --auto --delay 5m",
      },
      {
        label: "Stop auto sync",
        code: "gitfuse stop",
      },
    ],
  },
];

const navItems = [
  { label: "Introduction", href: "#introduction" },
  { label: "Quick start", href: "#quick-start" },
  { label: "Authentication", href: "#auth" },
  { label: "Repositories", href: "#repositories" },
  { label: "Sync workflow", href: "#sync" },
  { label: "Status", href: "#status" },
  { label: "Auto sync", href: "#auto-sync" },
];

export default function DocsPage() {
  return (
    <main className="gf-page gf-docs-page">
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
          <a href="/#features">Features</a>
          <a href="/#compare">Compare</a>
          <a href="/docs" className="active">
            Docs
          </a>
          <a href="/#pricing">Pricing</a>
          <a href="/#install">Install</a>
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

      <section className="gf-docs-shell">
        <aside className="gf-docs-left">
          <a href="/" className="gf-docs-back">
            ← Back to home
          </a>

          <nav className="gf-docs-toc" aria-label="On this page">
            <p>On this page</p>

            {navItems.map((item) => (
              <a key={item.href} href={item.href}>
                {item.label}
              </a>
            ))}
          </nav>
        </aside>

        <article className="gf-docs-content">
          <section id="introduction" className="gf-docs-hero">
            <div className="gf-pill">
              <span className="gf-pill-dot" />
              GitFuse CLI documentation
            </div>

            <h1>Commands for moving commits between machines.</h1>

            <p>
              GitFuse syncs local Git commit objects across devices without
              forcing you to push unfinished WIP commits to GitHub. This docs
              page covers the frontend command reference only. Backend-powered
              API docs, authentication settings, and live account controls can
              be connected later.
            </p>
          </section>

          <section className="gf-docs-callout">
            <div>
              <p>Recommended flow</p>
              <h2>Install → authenticate → add repo → sync → pull elsewhere.</h2>
            </div>

            <code>
              <span>
                <em>$</em> gitfuse auth login
              </span>
              <span>
                <em>$</em> gitfuse add .
              </span>
              <span>
                <em>$</em> gitfuse sync
              </span>
            </code>
          </section>

          {commandSections.map((section) => (
            <section
              key={section.id}
              id={section.id}
              className="gf-docs-section"
            >
              <div className="gf-docs-section-heading">
                <p>{section.title}</p>
                <h2>{section.title}</h2>
                <span>{section.description}</span>
              </div>

              <div className="gf-command-list">
                {section.commands.map((command) => (
                  <div key={command.label} className="gf-command-card">
                    <div>
                      <p>{command.label}</p>
                    </div>

                    <pre>
                      <code>
                        <em>$</em> {command.code}
                      </code>
                    </pre>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </article>
      </section>
    </main>
  );
}