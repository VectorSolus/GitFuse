"use client";

import Link from "next/link";
import { signOut } from "next-auth/react";
import { usePathname } from "next/navigation";

type DashboardUser = {
  name?: string | null;
  email?: string | null;
  image?: string | null;
};

const links = [
  { href: "/dashboard", label: "Overview", icon: "⌂" },
  { href: "/dashboard/repos", label: "Repositories", icon: "◇" },
  { href: "/dashboard/devices", label: "Devices", icon: "▣" },
  { href: "/dashboard/history", label: "History", icon: "↻" },
  { href: "/dashboard/usage", label: "Usage", icon: "◌" },
  { href: "/dashboard/billing", label: "Billing", icon: "$" }
];

function initials(user: DashboardUser) {
  const source = user.name || user.email || "gitfuse";
  return source
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function isActive(pathname: string, href: string) {
  if (href === "/dashboard") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function Sidebar({ user }: { user: DashboardUser }) {
  const pathname = usePathname();

  return (
    <aside className="gf-sidebar gf-collapsible-sidebar">
      <input aria-label="Collapse dashboard sidebar" className="gf-sidebar-toggle-input" id="gf-sidebar-toggle" type="checkbox" />
      <div>
        <label className="gf-sidebar-toggle" htmlFor="gf-sidebar-toggle" title="Collapse sidebar">
          ☰
        </label>
        <nav className="gf-sidebar-nav" aria-label="Dashboard navigation">
          {links.map((link) => (
            <Link
              aria-current={isActive(pathname, link.href) ? "page" : undefined}
              className={isActive(pathname, link.href) ? "active" : ""}
              href={link.href}
              key={link.href}
            >
              <span aria-hidden="true">{link.icon}</span>
              <span className="gf-sidebar-label">{link.label}</span>
            </Link>
          ))}
        </nav>
      </div>

      <div className="gf-sidebar-bottom">
        <Link className={isActive(pathname, "/dashboard/settings") ? "active" : ""} href="/dashboard/settings">
          <span aria-hidden="true">⚙</span>
          <span className="gf-sidebar-label">Settings</span>
        </Link>
        <details className="gf-user-menu">
          <summary>
            <span className="gf-avatar">{initials(user)}</span>
            <span className="gf-sidebar-label">
              <strong>{user.name || "gitfuse user"}</strong>
              <small>{user.email || "signed in"}</small>
            </span>
            <span className="gf-sidebar-label" aria-hidden="true">⌄</span>
          </summary>
          <div className="gf-menu-popover">
            <Link href="/dashboard/settings">Account settings</Link>
            <button type="button" onClick={() => signOut({ callbackUrl: "/login" })}>
              Sign out
            </button>
          </div>
        </details>
      </div>
    </aside>
  );
}
