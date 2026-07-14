"use client";

import Link from "next/link";
import { signOut } from "next-auth/react";
import { usePathname } from "next/navigation";

import { SpotlightNavbar } from "../ui/spotlight-navbar";

type DashboardUser = {
  name?: string | null;
  email?: string | null;
  image?: string | null;
};

const titles: Record<string, string> = {
  "/dashboard": "Overview",
  "/dashboard/repos": "Repositories",
  "/dashboard/devices": "Devices",
  "/dashboard/history": "Sync History",
  "/dashboard/usage": "Usage",
  "/dashboard/billing": "Billing",
  "/dashboard/settings": "Settings"
};

const navItems = [
  { label: "Overview", href: "/dashboard" },
  { label: "Repos", href: "/dashboard/repos" },
  { label: "Devices", href: "/dashboard/devices" },
  { label: "History", href: "/dashboard/history" },
  { label: "Usage", href: "/dashboard/usage" },
  { label: "Billing", href: "/dashboard/billing" }
];

function titleFor(pathname: string) {
  return titles[pathname] ?? "Dashboard";
}

function initials(user: DashboardUser) {
  const source = user.name || user.email || "gitfuse";
  return source
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export function Header({ user }: { user: DashboardUser }) {
  const pathname = usePathname();
  const title = titleFor(pathname);
  const activeIndex = Math.max(
    0,
    navItems.findIndex((item) => (item.href === "/dashboard" ? pathname === item.href : pathname.startsWith(item.href)))
  );

  return (
    <header className="gf-topbar gf-spotlight-topbar">
      <div className="gf-topbar-title">
        <Link className="gf-wordmark" href="/dashboard">
          <span aria-hidden="true">
            <svg viewBox="0 0 16 16">
              <path d="M9.7 1 3.4 8.4h4L6.3 15 12.6 6.9H8.7L9.7 1Z" />
            </svg>
          </span>
          gitfuse
        </Link>
        <div>
          <h1>{title}</h1>
          <nav aria-label="Breadcrumb">
            <Link href="/dashboard">Dashboard</Link>
            <span aria-hidden="true">/</span>
            <span>{title}</span>
          </nav>
        </div>
      </div>
      <SpotlightNavbar className="gf-dashboard-spotlight" defaultActiveIndex={activeIndex} items={navItems} />
      <div className="gf-topbar-actions">
        <button aria-label="Notifications" className="gf-icon-button" type="button">
          <svg viewBox="0 0 20 20">
            <path d="M10 2a5 5 0 0 0-5 5v3.2L3.6 13v1h12.8v-1L15 10.2V7a5 5 0 0 0-5-5Zm-2.2 14a2.4 2.4 0 0 0 4.4 0H7.8Z" />
          </svg>
        </button>
        <details className="gf-header-menu">
          <summary>
            <span className="gf-avatar">{initials(user)}</span>
          </summary>
          <div className="gf-menu-popover">
            <div className="gf-menu-id">
              <strong>{user.name || "gitfuse user"}</strong>
              <small>{user.email || "signed in"}</small>
            </div>
            <Link href="/dashboard/settings">Settings</Link>
            <button type="button" onClick={() => signOut({ callbackUrl: "/login" })}>
              Sign out
            </button>
          </div>
        </details>
      </div>
    </header>
  );
}
