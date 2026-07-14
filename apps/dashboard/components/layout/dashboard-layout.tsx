"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { SpotlightNavbar } from "../ui/spotlight-navbar";

type DashboardUser = {
  name?: string | null;
  email?: string | null;
  image?: string | null;
};

const navItems = [
  { label: "Overview", href: "/dashboard" },
  { label: "Repos", href: "/dashboard/repos" },
  { label: "Devices", href: "/dashboard/devices" },
  { label: "History", href: "/dashboard/history" },
  { label: "Usage", href: "/dashboard/usage" },
  { label: "Billing", href: "/dashboard/billing" },
];

export function DashboardLayout({ children, user }: { children: ReactNode; user: DashboardUser }) {
  const pathname = usePathname();
  const activeIndex = navItems.findIndex(item => pathname?.startsWith(item.href)) || 0;

  const initials = user?.name ? user.name.slice(0, 2).toUpperCase() : "GF";

  return (
    <div className="min-h-screen bg-[#020814] text-text dark">
      <header className="fixed top-0 left-0 w-full z-50 pointer-events-none">
        {/* Make the wrapper pointer-events-none but nav pointer-events-auto so we can click */}
        <div className="pointer-events-auto">
          <SpotlightNavbar
            items={navItems}
            defaultActiveIndex={activeIndex === -1 ? 0 : activeIndex}
            className="pt-4"
            rightContent={
              <div className="relative group cursor-pointer flex items-center ml-2">
                <div className="w-8 h-8 bg-ocean text-white rounded-full flex items-center justify-center text-xs font-bold ring-2 ring-transparent group-hover:ring-ocean/50 transition-all">
                  {initials}
                </div>

                {/* Dropdown menu on hover */}
                <div className="absolute right-0 top-full mt-2 w-48 bg-surface border border-surface-2 rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all">
                  <div className="px-4 py-3 border-b border-surface-2">
                    <p className="text-sm font-medium text-text">{user?.name || "GitFuse User"}</p>
                    <p className="text-xs text-text-3 truncate">{user?.email || "user@gitfuse.dev"}</p>
                  </div>
                  <div className="py-1">
                    <Link href="/settings" className="block px-4 py-2 text-sm text-text-2 hover:bg-ocean/10 hover:text-ocean transition-colors">
                      Settings
                    </Link>
                  </div>
                  <div className="border-t border-surface-2 py-1">
                    <button className="w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-red-400/10 transition-colors">
                      Sign out
                    </button>
                  </div>
                </div>
              </div>
            }
          />
        </div>
      </header>

      <main className="pt-24 min-h-screen">
        {children}
      </main>
    </div>
  );
}
