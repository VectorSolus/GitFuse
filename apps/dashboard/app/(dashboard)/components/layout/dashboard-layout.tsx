"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";

import { PairingPinOnboarding } from "./pairing-pin-onboarding";

type DashboardLayoutProps = {
  children: ReactNode;
  needsPairingPinOnboarding?: boolean;
  user: {
    name: string;
    email: string;
    plan?: "Free" | "Pro" | "Team";
  };
};

type IconName =
  | "overview"
  | "repos"
  | "devices"
  | "history"
  | "usage"
  | "billing"
  | "docs"
  | "settings"
  | "logout"
  | "search"
  | "bell"
  | "user"
  | "upgrade"
  | "chevron";

type NavItem = {
  label: string;
  href: string;
  icon: IconName;
  newTab?: boolean;
};

const navItems: NavItem[] = [
  {
    label: "Overview",
    href: "/dashboard",
    icon: "overview",
  },
  {
    label: "Repositories",
    href: "/dashboard/repos",
    icon: "repos",
  },
  {
    label: "Devices",
    href: "/dashboard/devices",
    icon: "devices",
  },
  {
    label: "History",
    href: "/dashboard/history",
    icon: "history",
  },
  {
    label: "Usage",
    href: "/dashboard/usage",
    icon: "usage",
  },
  {
    label: "Docs",
    href: "/docs",
    icon: "docs",
    newTab: true,
  },
];

const pageTitles: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/dashboard/repos": "Repositories",
  "/dashboard/devices": "Devices",
  "/dashboard/history": "History",
  "/dashboard/usage": "Usage",
  "/dashboard/settings": "Settings",
  "/dashboard/upgrade": "Early access plans",
};

export function DashboardLayout({
  children,
  needsPairingPinOnboarding = false,
  user,
}: DashboardLayoutProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement | null>(null);

  const pageTitle = useMemo(() => {
    const matchedPath = Object.keys(pageTitles)
      .sort((a, b) => b.length - a.length)
      .find((path) => pathname === path || pathname.startsWith(`${path}/`));

    return matchedPath ? pageTitles[matchedPath] : "Dashboard";
  }, [pathname]);

  const initials = useMemo(() => {
    const cleanName = user.name?.trim() || user.email?.trim() || "GitFuse";
    const parts = cleanName.split(/\s+/).filter(Boolean);

    if (parts.length === 1) {
      return parts[0].slice(0, 2).toUpperCase();
    }

    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }, [user.email, user.name]);

  const subscriptionTier = user.plan ?? "Free";

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!profileMenuRef.current) return;

      if (!profileMenuRef.current.contains(event.target as Node)) {
        setProfileMenuOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setProfileMenuOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  function isActive(href: string) {
    if (href === "/dashboard") {
      return pathname === "/dashboard";
    }

    return pathname.startsWith(href);
  }

  return (
    <main
      className={`gf-dash-shell ${collapsed ? "gf-dash-shell-collapsed" : ""}`}
    >
      <aside className="gf-dash-sidebar">
        <div className="gf-dash-sidebar-top">
          {collapsed ? (
            <button
              type="button"
              className="gf-dash-brand-toggle is-collapsed"
              onClick={() => setCollapsed(false)}
              aria-label="Expand sidebar"
            >
              <span className="gf-dash-brand-mark" aria-hidden="true">
                <span className="gf-dash-brand-letter">G</span>

                <svg
                  className="gf-dash-brand-arrow"
                  viewBox="0 0 24 24"
                  fill="none"
                  aria-hidden="true"
                >
                  <rect
                    x="3.5"
                    y="4.5"
                    width="17"
                    height="15"
                    rx="4"
                    stroke="currentColor"
                    strokeWidth="1.9"
                  />
                  <path
                    d="M9 8.5v7"
                    stroke="currentColor"
                    strokeWidth="1.9"
                    strokeLinecap="round"
                  />
                  <path
                    d="M13 9l3 3-3 3"
                    stroke="currentColor"
                    strokeWidth="1.9"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
            </button>
          ) : (
            <div className="gf-dash-expanded-brand-row">
              <Link href="/dashboard" className="gf-dash-expanded-brand">
                Git<span>Fuse</span>
              </Link>

              <button
                type="button"
                className="gf-dash-sidebar-arrow"
                onClick={() => setCollapsed(true)}
                aria-label="Collapse sidebar"
              >
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <rect
                    x="3.5"
                    y="4.5"
                    width="17"
                    height="15"
                    rx="4"
                    stroke="currentColor"
                    strokeWidth="1.9"
                  />
                  <path
                    d="M15 8.5v7"
                    stroke="currentColor"
                    strokeWidth="1.9"
                    strokeLinecap="round"
                  />
                  <path
                    d="M11 9l-3 3 3 3"
                    stroke="currentColor"
                    strokeWidth="1.9"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            </div>
          )}
        </div>

        <nav className="gf-dash-nav" aria-label="Dashboard navigation">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              target={item.newTab ? "_blank" : undefined}
              rel={item.newTab ? "noopener noreferrer" : undefined}
              className={`gf-dash-nav-item ${
                !item.newTab && isActive(item.href) ? "active" : ""
              }`}
              title={collapsed ? item.label : undefined}
            >
              <Icon name={item.icon} />
              <span className="gf-dash-label">{item.label}</span>
            </Link>
          ))}
        </nav>

        <div className="gf-dash-sidebar-bottom" ref={profileMenuRef}>
          <div
            className={`gf-profile-menu-shell ${
              profileMenuOpen ? "is-open" : ""
            }`}
          >
            <button
              type="button"
              className="gf-dash-user-card gf-dash-user-button"
              onClick={() => setProfileMenuOpen((value) => !value)}
              aria-label="Open profile menu"
              aria-expanded={profileMenuOpen}
            >
              <div className="gf-dash-user-avatar">{initials}</div>

              <div className="gf-dash-user-meta">
                <div className="gf-dash-user-name-row">
                  <strong>{user.name}</strong>
                  <span className="gf-account-tier">{subscriptionTier}</span>
                </div>
                <p>{user.email}</p>
              </div>

              <span className="gf-profile-menu-arrow" aria-hidden="true">
                <Icon name="chevron" />
              </span>
            </button>

            {profileMenuOpen ? (
              <div className="gf-profile-menu" role="menu">
                <div className="gf-profile-menu-head">
                  <div className="gf-dash-user-avatar">{initials}</div>

                  <div>
                    <div className="gf-dash-user-name-row">
                      <strong>{user.name}</strong>
                      <span className="gf-account-tier">
                        {subscriptionTier}
                      </span>
                    </div>
                    <p>{user.email}</p>
                  </div>
                </div>

                <div className="gf-profile-menu-list">
                  <Link
                    href="/dashboard/settings?section=profile"
                    role="menuitem"
                    onClick={() => setProfileMenuOpen(false)}
                  >
                    <Icon name="user" />
                    <span>Profile</span>
                  </Link>

                  <Link
                    href="/dashboard/settings"
                    role="menuitem"
                    onClick={() => setProfileMenuOpen(false)}
                  >
                    <Icon name="settings" />
                    <span>Settings</span>
                  </Link>

                  <Link
                    href="/dashboard/settings?section=billing"
                    role="menuitem"
                    onClick={() => setProfileMenuOpen(false)}
                  >
                    <Icon name="billing" />
                    <span>Billing</span>
                  </Link>

                  <Link
                    href="/dashboard/upgrade"
                    role="menuitem"
                    onClick={() => setProfileMenuOpen(false)}
                  >
                    <Icon name="upgrade" />
                    <span>Early access plans</span>
                  </Link>

                  <Link
                    href="/dashboard/usage"
                    role="menuitem"
                    onClick={() => setProfileMenuOpen(false)}
                  >
                    <Icon name="usage" />
                    <span>Usage</span>
                  </Link>

                  <button
                    type="button"
                    role="menuitem"
                    className="gf-profile-menu-signout"
                    onClick={() => void signOut({ callbackUrl: "/" })}
                  >
                    <Icon name="logout" />
                    <span>Sign out</span>
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </aside>

      <section className="gf-dash-main">
        <header className="gf-dash-header">
          <div>
            <p>Workspace</p>
            <h1>{pageTitle}</h1>
          </div>

          <div className="gf-dash-header-actions">
            <div className="gf-dash-search">
              <Icon name="search" />
              <input type="search" placeholder="Search repositories..." />
            </div>

            <button
              type="button"
              className="gf-dash-icon-button"
              aria-label="Notifications"
            >
              <Icon name="bell" />
            </button>
          </div>
        </header>

        <div className="gf-dash-content">{children}</div>
      </section>

      <PairingPinOnboarding needsPairingPin={needsPairingPinOnboarding} />
    </main>
  );
}

function Icon({ name }: { name: IconName }) {
  return icons[name];
}

const baseIconProps = {
  width: 20,
  height: 20,
  viewBox: "0 0 24 24",
  fill: "none",
  xmlns: "http://www.w3.org/2000/svg",
};

const strokeProps = {
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

const icons = {
  overview: (
    <svg {...baseIconProps}>
      <rect x="3" y="3" width="7" height="7" rx="2" {...strokeProps} />
      <rect x="14" y="3" width="7" height="7" rx="2" {...strokeProps} />
      <rect x="14" y="14" width="7" height="7" rx="2" {...strokeProps} />
      <rect x="3" y="14" width="7" height="7" rx="2" {...strokeProps} />
    </svg>
  ),

  repos: (
    <svg {...baseIconProps}>
      <path d="M6 3v12" {...strokeProps} />
      <circle cx="6" cy="5" r="2" {...strokeProps} />
      <circle cx="18" cy="19" r="2" {...strokeProps} />
      <path d="M6 13c0 3 2 6 6 6h4" {...strokeProps} />
      <path d="M12 8h5a3 3 0 0 1 3 3v1" {...strokeProps} />
    </svg>
  ),

  devices: (
    <svg {...baseIconProps}>
      <rect x="3" y="4" width="13" height="10" rx="2" {...strokeProps} />
      <rect x="17" y="8" width="4" height="12" rx="1.5" {...strokeProps} />
      <path d="M7 20h6" {...strokeProps} />
      <path d="M10 14v6" {...strokeProps} />
    </svg>
  ),

  history: (
    <svg {...baseIconProps}>
      <path d="M3 12a9 9 0 1 0 3-6.7" {...strokeProps} />
      <path d="M3 4v5h5" {...strokeProps} />
      <path d="M12 7v5l3 2" {...strokeProps} />
    </svg>
  ),

  usage: (
    <svg {...baseIconProps}>
      <path d="M4 19V5" {...strokeProps} />
      <path d="M4 19h16" {...strokeProps} />
      <path d="M8 16v-5" {...strokeProps} />
      <path d="M12 16V8" {...strokeProps} />
      <path d="M16 16v-3" {...strokeProps} />
    </svg>
  ),

  billing: (
    <svg {...baseIconProps}>
      <rect x="3" y="5" width="18" height="14" rx="3" {...strokeProps} />
      <path d="M3 10h18" {...strokeProps} />
      <path d="M7 15h4" {...strokeProps} />
    </svg>
  ),

  docs: (
    <svg {...baseIconProps}>
      <path
        d="M7 3h7l4 4v14H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z"
        {...strokeProps}
      />
      <path d="M14 3v5h5" {...strokeProps} />
      <path d="M9 13h6" {...strokeProps} />
      <path d="M9 17h4" {...strokeProps} />
    </svg>
  ),

  settings: (
    <svg {...baseIconProps}>
      <path
        d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"
        {...strokeProps}
      />
      <path
        d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21a2 2 0 0 1-4 0v-.08A1.7 1.7 0 0 0 8 19.4a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 3.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H2a2 2 0 0 1 0-4h.08A1.7 1.7 0 0 0 3.6 8a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 3.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V2a2 2 0 0 1 4 0v.08A1.7 1.7 0 0 0 16 3.6a1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 20.4 9c.16.38.4.73.6 1 .32.3.7.48 1.1.5H22a2 2 0 0 1 0 4h-.08A1.7 1.7 0 0 0 20.4 15Z"
        {...strokeProps}
      />
    </svg>
  ),

  logout: (
    <svg {...baseIconProps}>
      <path d="M10 17l5-5-5-5" {...strokeProps} />
      <path d="M15 12H3" {...strokeProps} />
      <path d="M21 19V5a2 2 0 0 0-2-2h-5" {...strokeProps} />
    </svg>
  ),

  search: (
    <svg {...baseIconProps}>
      <circle cx="11" cy="11" r="7" {...strokeProps} />
      <path d="M20 20l-3.5-3.5" {...strokeProps} />
    </svg>
  ),

  bell: (
    <svg {...baseIconProps}>
      <path
        d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"
        {...strokeProps}
      />
      <path d="M10 21h4" {...strokeProps} />
    </svg>
  ),

  user: (
    <svg {...baseIconProps}>
      <circle cx="12" cy="8" r="4" {...strokeProps} />
      <path d="M4 21a8 8 0 0 1 16 0" {...strokeProps} />
    </svg>
  ),

  upgrade: (
    <svg {...baseIconProps}>
      <path d="M12 19V5" {...strokeProps} />
      <path d="M6 11l6-6 6 6" {...strokeProps} />
      <path d="M5 21h14" {...strokeProps} />
    </svg>
  ),

  chevron: (
    <svg {...baseIconProps}>
      <path d="M6 9l6 6 6-6" {...strokeProps} />
    </svg>
  ),
};
