<div align="center">

# gitfuse

**Your commits, everywhere.**

A CLI-first encrypted sync layer that moves local git commits across any number of devices — without pushing to GitHub.

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](LICENSE)
![Status: v1.0 in development](https://img.shields.io/badge/status-v1.0_in_development-orange)
![Go](https://img.shields.io/badge/Go-1.22+-00ADD8)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6)

</div>

---

## The problem

Every git commit lives only on the machine it was made on — until you push. If you switch devices mid-feature, your only options are a dirty "WIP" push, leaving work behind, or starting over.

gitfuse closes that gap. It moves your local commits through a private encrypted relay so you can continue exactly where you left off on any machine, without ever touching your remote history.

GitFuse is launching as Free Early Access. Pro and Team plans are visible for planning only and are Coming Soon.

---

## Quick start

```zsh
# Install
brew tap VectorSolus/gitfuse https://github.com/VectorSolus/GitFuse.git
brew install VectorSolus/gitfuse/gitfuse

# Register this device
gitfuse auth login

# Add a project and sync
cd my-project
gitfuse add .
gitfuse sync

# On any other device
gitfuse pull
```

That is it. Your commits are there, with identical SHAs, authorship, and history.

---

## Sync modes

```zsh
# Manual — sync at end of session
gitfuse sync

# Range — sync specific commits only
gitfuse sync HEAD~3..HEAD

# Auto — sync silently after every git commit
gitfuse autosync enable
```

---

## Core commands

```zsh
# Setup
gitfuse auth login                  # Register this device (browser or --headless)
gitfuse auth whoami                 # Show the authenticated account and device
gitfuse auth logout                 # Remove the local session
gitfuse add .                       # Add current repo to workspace
gitfuse init                        # git init + create GitHub repo from current dir + link + sync
gitfuse init "project" --public     # Same flow with an explicit remote repo name

# Sync
gitfuse sync                        # Upload commits to relay
gitfuse sync --dry-run              # Preview without uploading
gitfuse sync HEAD~3..HEAD           # Range sync
gitfuse sync --pick                 # Interactive commit selector
gitfuse pull                        # Replay relay commits onto this device
gitfuse push                        # Send relay-curated history to GitHub remote

# Control
gitfuse autosync enable             # Enable post-commit auto sync
gitfuse autosync disable            # Suspend auto sync
gitfuse autosync status             # Show auto sync state
gitfuse drop HEAD~1                 # Remove a commit from relay
gitfuse undo                        # Roll back last sync event

# Workspace
gitfuse repo list                   # List tracked repositories
gitfuse repo remove project-name    # Remove local GitFuse tracking
gitfuse status --all                # Sync state across all repos
gitfuse history                     # Show sync history and commit states
gitfuse devices                     # List trusted devices
gitfuse connect                     # Set up all repos on a new device
gitfuse restore project-name        # Restore project from relay to this device
gitfuse claim                       # Recover relay entry when .git was lost
```

---

## How it works

gitfuse packages git commit objects into encrypted bundles using `git bundle` under the hood, uploads them to a private relay, and replays them with SHA-preserving fidelity on any other registered device.

```
Device A                    Relay                       Device B
─────────                   ─────                       ────────
git commit       →     encrypted bundle     →       gitfuse pull
gitfuse sync           (Cloudflare R2)            identical SHA
                        age encryption             same author
                        AGPL CLI + code            same history
                        proprietary infra
```

**What gitfuse syncs:** committed git objects only.
**What gitfuse never touches:** untracked files, working tree, stash, or anything not committed.

---

## Architecture

| Layer | Technology |
|---|---|
| CLI | Go 1.22+, Cobra, Bubble Tea, go-git, age encryption |
| Relay API | Hono (TypeScript), Railway, Drizzle ORM |
| Bundle storage | Cloudflare R2 (zero egress fees) |
| Database | PostgreSQL via Supabase |
| Dashboard | Next.js 14, shadcn/ui, NextAuth v5 |
| Billing | Razorpay infrastructure, deferred for Free Early Access |
| Email | Resend |

---

## Plans

GitFuse is available as Free Early Access. Paid checkout is not available during this launch mode; Pro and Team remain Coming Soon.

| | Free | Pro | Team | Enterprise |
|---|---|---|---|---|
| Price | $0 Free Early Access | Coming Soon | Coming Soon | Custom |
| Repositories | 5 | Unlimited | Unlimited | Unlimited |
| Devices | 3 | Unlimited | Unlimited | Custom |
| History | 30 days | 1 year | 1 year | Custom |
| Shared WIP branches | — | — | ✓ | ✓ |
| Self-hosted relay | — | — | — | ✓ |

---

## Development setup

**Prerequisites:** Go 1.22+, Node 20+, pnpm, PostgreSQL

```zsh
# Clone and install
git clone https://github.com/VectorSolus/GitFuse
cd gitfuse
pnpm install

# Start relay API
cp relay/.env.example relay/.env   # fill in DATABASE_URL and R2 credentials
pnpm --filter @gitfuse/relay start

# Build CLI
go -C apps/cli build -o ../../bin/gitfuse .
./bin/gitfuse --help

# Run CLI tests
go -C apps/cli test ./...
```

---

## Project structure

```
gitfuse/
├── apps/cli/           Go CLI — the gitfuse binary
├── apps/dashboard/     Next.js web dashboard
├── relay/              Hono relay API server
├── packages/db/        Drizzle schema and migrations
├── packages/types/     Shared TypeScript types
└── .github/workflows/  CI and release pipelines
```

---

## Status

| Component | Status |
|---|---|
| Relay API (all 12 routes) | ✅ Complete |
| Database schema | ✅ Complete |
| Shared types | ✅ Complete |
| CLI foundation + identity | ✅ Complete |
| CLI encryption and bundle | 🔄 In progress |
| CLI sync, pull, push | 🔄 Planned |
| Dashboard | 🔄 Planned |

---

## License

The gitfuse CLI is open source under [AGPL v3](LICENSE).
The hosted relay infrastructure is proprietary.
