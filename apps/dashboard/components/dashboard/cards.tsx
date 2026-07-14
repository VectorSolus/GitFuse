import type { ReactNode } from "react";
import { FolderGit2, Laptop, Clock, Activity, Terminal } from "lucide-react";

type StatCardProps = {
  label: string;
  value: ReactNode;
  subtext?: ReactNode;
  progress?: number;
};

export function StatCard({ label, value, subtext, progress }: StatCardProps) {
  return (
    <section className="bg-[#061428] border border-surface-2 border-l-2 border-l-ocean rounded-xl p-6 shadow-sm">
      <span className="text-text-2 text-sm font-medium">{label}</span>
      <strong className="block text-3xl font-bold text-text mt-2 mb-1">{value}</strong>
      {subtext ? <p className="text-sm text-text-3">{subtext}</p> : null}
      {typeof progress === "number" ? (
        <div className="mt-4 h-1.5 w-full bg-[#020814] rounded-full overflow-hidden" aria-hidden="true">
          <span className="block h-full bg-ocean" style={{ width: `${Math.min(100, Math.max(0, progress))}%` }} />
        </div>
      ) : null}
    </section>
  );
}

export function Badge({
  children,
  tone = "slate"
}: {
  children: ReactNode;
  tone?: "blue" | "emerald" | "amber" | "red" | "slate";
}) {
  const tones = {
    blue: "bg-ocean/10 text-ocean border-ocean/20",
    emerald: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
    amber: "bg-amber-500/10 text-amber-500 border-amber-500/20",
    red: "bg-red-500/10 text-red-400 border-red-500/20",
    slate: "bg-surface-2 text-text-3 border-surface-2"
  };

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${tones[tone]}`}>
      {children}
    </span>
  );
}

export function EmptyState({
  title,
  children,
  action,
  icon = "terminal"
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
  icon?: "folder" | "laptop" | "activity" | "terminal";
}) {
  const icons = {
    folder: <FolderGit2 className="w-10 h-10 text-ocean mx-auto" />,
    laptop: <Laptop className="w-10 h-10 text-ocean mx-auto" />,
    activity: <Activity className="w-10 h-10 text-ocean mx-auto" />,
    terminal: <Terminal className="w-10 h-10 text-ocean mx-auto" />
  };

  return (
    <section className="text-center py-12 px-4">
      <div aria-hidden="true" className="mb-4">
        {icons[icon]}
      </div>
      <h2 className="text-lg font-medium text-text mb-2">{title}</h2>
      <p className="text-text-3 text-sm mb-6 max-w-sm mx-auto">{children}</p>
      {action}
    </section>
  );
}
