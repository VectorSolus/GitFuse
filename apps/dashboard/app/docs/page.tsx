"use client";

import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

import { INSTALL_GUIDES, installCommandRows } from "@/lib/install-commands";

const sections = [
  {
    id: "introduction",
    label: "Introduction",
  },
  {
    id: "quick-start",
    label: "Quick start",
  },
  {
    id: "installation",
    label: "Installation",
  },
  {
    id: "authentication",
    label: "Authentication",
  },
  {
    id: "repositories",
    label: "Repositories",
  },
  {
    id: "sync-workflow",
    label: "Sync workflow",
  },
  {
    id: "status",
    label: "Status",
  },
  {
    id: "auto-sync",
    label: "Auto sync",
  },
];

const quickStartCommands = INSTALL_GUIDES.macos.commands.map((command, index) => ({
  label: [
    "Install the CLI",
    "Authenticate your device",
    "Track current repository",
    "Sync private commits",
  ][index],
  command,
}));

const installationCommands = installCommandRows().map((guide) => ({
  label: `${guide.label} install`,
  command: guide.commands[0],
}));

const commandGroups = [
  {
    id: "quick-start",
    eyebrow: "Quick start",
    title: "Set up GitFuse in four commands.",
    body: "Install the CLI, authenticate your device, add the current repository, and sync your first local commit bundle.",
    commands: quickStartCommands,
  },
  {
    id: "installation",
    eyebrow: "Installation",
    title: "Install with the public platform commands.",
    body: "These commands are the public contract. External Homebrew and Winget acceptance, DNS, and endpoint publication must be verified separately before they are described as live.",
    commands: installationCommands,
  },
  {
    id: "authentication",
    eyebrow: "Authentication",
    title: "Connect a machine to your GitFuse workspace.",
    body: "Authentication is GitHub or Google based, but your GitFuse dashboard account, devices, and sync history remain separate.",
    commands: [
      {
        label: "Start auth flow",
        command: "gitfuse auth login",
      },
      {
        label: "Show current identity",
        command: "gitfuse auth whoami",
      },
      {
        label: "Remove local session",
        command: "gitfuse auth logout",
      },
    ],
  },
  {
    id: "repositories",
    eyebrow: "Repositories",
    title: "Choose which repositories GitFuse should track.",
    body: "A repository must be explicitly added before local commits can be bundled and moved through the private relay.",
    commands: [
      {
        label: "Add current repository",
        command: "gitfuse add .",
      },
      {
        label: "List tracked repositories",
        command: "gitfuse repo list",
      },
      {
        label: "Remove repository",
        command: "gitfuse repo remove <repo>",
      },
    ],
  },
  {
    id: "sync-workflow",
    eyebrow: "Sync workflow",
    title: "Move work in progress without publishing it.",
    body: "Sync from one machine, then pull on another machine to continue with the same local history.",
    commands: [
      {
        label: "Create private bundle",
        command: "gitfuse sync",
      },
      {
        label: "Pull synced commits",
        command: "gitfuse pull",
      },
      {
        label: "Rebase after pulling",
        command: "gitfuse rebase-sync",
      },
    ],
  },
  {
    id: "status",
    eyebrow: "Status",
    title: "Inspect repository and relay state.",
    body: "Use status commands to understand what is tracked, what is pending, and what has already been moved.",
    commands: [
      {
        label: "Workspace status",
        command: "gitfuse status",
      },
      {
        label: "Recent relay history",
        command: "gitfuse history",
      },
      {
        label: "Connected devices",
        command: "gitfuse devices",
      },
    ],
  },
  {
    id: "auto-sync",
    eyebrow: "Auto sync",
    title: "Control automatic sync.",
    body: "Enable, disable, and inspect automatic sync for the active repository from the same command group.",
    commands: [
      {
        label: "Enable auto sync",
        command: "gitfuse autosync enable",
      },
      {
        label: "Disable auto sync",
        command: "gitfuse autosync disable",
      },
      {
        label: "Show auto sync status",
        command: "gitfuse autosync status",
      },
    ],
  },
];

export default function DocsPage() {
  const router = useRouter();
  const { status } = useSession();

  function handleBack() {
    if (status === "loading") return;

    if (status === "authenticated") {
      router.push("/dashboard");
      return;
    }

    router.push("/");
  }

  return (
    <main className="gf-docs-page">
      <header className="gf-docs-header">
        <a href="/" className="gf-docs-logo">
          Git<span>Fuse</span>
        </a>

        <button
          type="button"
          className="gf-docs-back-button"
          onClick={handleBack}
          disabled={status === "loading"}
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            width="17"
            height="17"
            fill="none"
          >
            <path
              d="M15 18l-6-6 6-6"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          Back
        </button>
      </header>

      <div className="gf-docs-shell">
        <aside className="gf-docs-sidebar" aria-label="Documentation sections">
          <p>On this page</p>

          <nav>
            {sections.map((section) => (
              <a key={section.id} href={`#${section.id}`}>
                {section.label}
              </a>
            ))}
          </nav>
        </aside>

        <article className="gf-docs-content">
          <section id="introduction" className="gf-docs-hero">
            <div className="gf-pill gf-docs-pill">
              <span className="gf-pill-dot" />
              GitFuse CLI documentation
            </div>

            <h1>Commands for moving commits between machines.</h1>

            <p>
              GitFuse syncs local Git commit objects across devices without
              forcing you to push unfinished WIP commits to GitHub. This docs
              page covers the frontend command reference and can later be wired
              to live backend-generated API documentation.
            </p>

            <div className="gf-docs-flow-card">
              <div>
                <span>Recommended flow</span>
                <strong>
                  Install → authenticate → add repo → sync → pull elsewhere.
                </strong>
              </div>

              <pre>
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
              </pre>
            </div>
          </section>

          {commandGroups.map((group) => (
            <section key={group.id} id={group.id} className="gf-docs-section">
              <p className="gf-dash-eyebrow">{group.eyebrow}</p>
              <h2>{group.title}</h2>
              <p>{group.body}</p>

              <div className="gf-docs-command-grid">
                {group.commands.map((item) => (
                  <div key={item.command} className="gf-docs-command-card">
                    <span>{item.label}</span>

                    <code>
                      <em>$</em> {item.command}
                    </code>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </article>
      </div>
    </main>
  );
}
