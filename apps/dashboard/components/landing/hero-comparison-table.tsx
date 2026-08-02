const rows = [
  {
    capability: "Syncs real commit objects",
    gitfuse: "Yes",
    github: "Manual push",
    cloud: "No",
  },
  {
    capability: "Preserves SHA, author, and history",
    gitfuse: "Yes",
    github: "Yes",
    cloud: "No",
  },
  {
    capability: "No WIP commits on public remotes",
    gitfuse: "Yes",
    github: "No",
    cloud: "Partial",
  },
  {
    capability: "Works across editors",
    gitfuse: "Yes",
    github: "Yes",
    cloud: "Limited",
  },
  {
    capability: "Multi-device relay",
    gitfuse: "Encrypted",
    github: "Remote repo",
    cloud: "Vendor cloud",
  },
];

function StatusPill({ value }: { value: string }) {
  const positive = value === "Yes" || value === "Encrypted";

  return (
    <span
      className={[
        "inline-flex rounded-full border px-3 py-1 text-xs font-medium",
        positive
          ? "border-cyan-300/20 bg-cyan-300/10 text-cyan-100"
          : "border-white/10 bg-white/[0.04] text-slate-300",
      ].join(" ")}
    >
      {value}
    </span>
  );
}

export function HeroComparisonTable() {
  return (
    <div className="mx-auto mt-8 max-w-5xl overflow-hidden rounded-3xl border border-white/10 bg-white/[0.035] shadow-ocean-soft backdrop-blur-xl">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse text-left">
          <thead>
            <tr className="border-b border-white/10 bg-white/[0.06]">
              <th className="px-5 py-4 text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
                Capability
              </th>
              <th className="px-5 py-4 text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
                GitFuse
              </th>
              <th className="px-5 py-4 text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
                GitHub Push
              </th>
              <th className="px-5 py-4 text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
                Cloud Changes
              </th>
            </tr>
          </thead>

          <tbody>
            {rows.map((row) => (
              <tr
                key={row.capability}
                className="border-b border-white/[0.06] last:border-b-0"
              >
                <td className="px-5 py-4 text-sm font-medium text-slate-100">
                  {row.capability}
                </td>
                <td className="px-5 py-4">
                  <StatusPill value={row.gitfuse} />
                </td>
                <td className="px-5 py-4">
                  <StatusPill value={row.github} />
                </td>
                <td className="px-5 py-4">
                  <StatusPill value={row.cloud} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}