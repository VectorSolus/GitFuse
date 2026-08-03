"use client";

import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Fragment } from "react";

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
    id: "status-history",
    label: "Status & history",
  },
  {
    id: "devices",
    label: "Devices",
  },
  {
    id: "auto-sync",
    label: "Auto sync",
  },
  {
    id: "pause-resume",
    label: "Pause & resume",
  },
  {
    id: "recovery",
    label: "Recovery",
  },
  {
    id: "account-config",
    label: "Account & config",
  },
  {
    id: "legacy-helpers",
    label: "Legacy helpers",
  },
];

const quickStartCommands = INSTALL_GUIDES.macos.commands.map((command, index) => ({
  label: [
    "Add Homebrew tap",
    "Install the CLI",
    "Authenticate your device",
    "Track current repository",
    "Sync private commits",
  ][index],
  command,
}));

const installationCommands = installCommandRows().map((guide) => ({
  label: `${guide.label} install`,
  command:
    guide.key === "macos" ? guide.commands.slice(0, 2).join("\n") : guide.commands[0],
}));

const commandGroups = [
  {
    id: "quick-start",
    eyebrow: "Quick start",
    title: "Set up GitFuse from your terminal.",
    body: "Tap and install the CLI, authenticate your device, add the current repository, and sync your first local commit bundle.",
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
        label: "Start headless auth flow",
        command: "gitfuse auth login --headless",
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
      {
        label: "Choose active repository",
        command: "gitfuse repos",
      },
      {
        label: "Set active repository",
        command: "gitfuse use <name>",
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
        label: "Preview sync",
        command: "gitfuse sync --dry-run",
      },
      {
        label: "Pick commits interactively",
        command: "gitfuse sync --pick",
      },
      {
        label: "Sync all commits",
        command: "gitfuse sync --all",
      },
      {
        label: "Pull synced commits",
        command: "gitfuse pull",
      },
      {
        label: "Pull into a new branch",
        command: "gitfuse pull --as-branch <branch>",
      },
      {
        label: "Sync rebased history",
        command: "gitfuse rebase-sync",
      },
    ],
  },
  {
    id: "status-history",
    eyebrow: "Status & history",
    title: "Inspect repository and relay state.",
    body: "Use status and history commands to understand what is tracked, what is pending, and what has already moved through the relay.",
    commands: [
      {
        label: "Repository status",
        command: "gitfuse status",
      },
      {
        label: "All tracked repository statuses",
        command: "gitfuse status --all",
      },
      {
        label: "Recent relay history",
        command: "gitfuse history",
      },
      {
        label: "Legacy history alias",
        command: "gitfuse log",
      },
    ],
  },
  {
    id: "devices",
    eyebrow: "Devices",
    title: "View and manage connected machines.",
    body: "Device commands show which machines are connected to your GitFuse workspace and allow a registered device to be revoked.",
    commands: [
      {
        label: "List connected devices",
        command: "gitfuse devices",
      },
      {
        label: "Revoke a device",
        command: "gitfuse devices revoke <id>",
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
        label: "Show auto sync status",
        command: "gitfuse autosync status",
      },
      {
        label: "Enable auto sync",
        command: "gitfuse autosync enable",
      },
      {
        label: "Enable with delay",
        command: "gitfuse autosync enable --delay 5s",
      },
      {
        label: "Disable auto sync",
        command: "gitfuse autosync disable",
      },
      {
        label: "Legacy start command",
        command: "gitfuse start --auto",
      },
    ],
  },
  {
    id: "pause-resume",
    eyebrow: "Pause & resume",
    title: "Temporarily stop or restart sync.",
    body: "Pause prevents GitFuse from syncing, while resume returns the repository to normal synced operation.",
    commands: [
      {
        label: "Pause sync",
        command: "gitfuse pause",
      },
      {
        label: "Pause until an event",
        command: "gitfuse pause --until <event>",
      },
      {
        label: "Resume sync",
        command: "gitfuse resume",
      },
      {
        label: "Resume from recent commits",
        command: "gitfuse resume --from <count>",
      },
    ],
  },
  {
    id: "recovery",
    eyebrow: "Recovery",
    title: "Recover or repair repository state.",
    body: "Recovery commands are useful when restoring a project, claiming transferred work, or correcting relay-side commit state.",
    commands: [
      {
        label: "Restore from relay bundles",
        command: "gitfuse restore <relay-entry-name>",
      },
      {
        label: "Claim transferred folder",
        command: "gitfuse claim",
      },
      {
        label: "Connect to existing relay repos",
        command: "gitfuse connect",
      },
      {
        label: "Reverse last sync event",
        command: "gitfuse undo",
      },
      {
        label: "Drop relay-side commit",
        command: "gitfuse drop",
      },
      {
        label: "Inspect local setup",
        command: "gitfuse doctor",
      },
    ],
  },
  {
    id: "account-config",
    eyebrow: "Account & config",
    title: "Inspect account limits and local CLI configuration.",
    body: "These commands help users confirm their current plan, config directory, installed version, and available updates.",
    commands: [
      {
        label: "Show account limits",
        command: "gitfuse limits",
      },
      {
        label: "Show config directory",
        command: "gitfuse config-dir",
      },
      {
        label: "Show CLI version",
        command: "gitfuse version",
      },
      {
        label: "Check for updates",
        command: "gitfuse update",
      },
    ],
  },
  {
    id: "legacy-helpers",
    eyebrow: "Legacy helpers",
    title: "Compatibility commands kept for older workflows.",
    body: "These commands remain available for users who started with the earlier CLI contract.",
    commands: [
      {
        label: "Initialize and register",
        command: "gitfuse init",
      },
      {
        label: "Open interactive pickers",
        command: "gitfuse pick",
      },
      {
        label: "Push curated commits",
        command: "gitfuse push",
      },
      {
        label: "Choose repository alias",
        command: "gitfuse repos",
      },
      {
        label: "History alias",
        command: "gitfuse log",
      },
      {
        label: "Automation alias",
        command: "gitfuse start",
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
                      {item.command.split("\n").map((line, index, lines) => (
                        <Fragment key={`${line}-${index}`}>
                          <em>$</em> {line}
                          {index < lines.length - 1 ? <br /> : null}
                        </Fragment>
                      ))}
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
