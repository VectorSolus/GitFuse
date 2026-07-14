"use client";

import { formatBytes, formatRelativeTime } from "./format";
import { EmptyState, Badge } from "./cards";
import { FolderGit2 } from "lucide-react";

export function ReposTable({ repositories }: { repositories: any[] }) {
  if (repositories.length === 0) {
    return (
      <EmptyState title="No repositories yet" icon="folder">
        Run <code className="bg-background text-ocean px-1.5 py-0.5 rounded text-xs mx-1 border border-surface-2">gitfuse add .</code> in any directory to link it to gitfuse.
      </EmptyState>
    );
  }

  return (
    <div className="dark bg-surface border border-surface-2 rounded-xl overflow-hidden shadow-sm">
      <table aria-label="Repositories table" className="w-full border-collapse">
        <thead>
          <tr>
            <th className="bg-surface/50 p-4 text-left text-xs font-bold uppercase text-text-2">Name</th>
            <th className="bg-surface/50 p-4 text-left text-xs font-bold uppercase text-text-2">Last sync</th>
            <th className="bg-surface/50 p-4 text-left text-xs font-bold uppercase text-text-2">Size</th>
            <th className="bg-surface/50 p-4 text-left text-xs font-bold uppercase text-text-2">Status</th>
          </tr>
        </thead>
        <tbody>
          {repositories.map((repo: any) => (
            <tr className="hover:bg-background/50 transition-colors" key={repo.id}>
              <td className="border-t border-surface-2/50 p-4 text-text">
                <div className="flex items-center gap-3">
                  <FolderGit2 className="w-5 h-5 text-ocean" />
                  <span className="font-medium text-text">{repo.name}</span>
                </div>
              </td>
              <td className="border-t border-surface-2/50 p-4 text-text">{repo.lastSyncAt ? formatRelativeTime(repo.lastSyncAt) : "Never"}</td>
              <td className="border-t border-surface-2/50 p-4 text-text">{formatBytes(repo.sizeBytes || 0)}</td>
              <td className="border-t border-surface-2/50 p-4 text-text">
                <Badge tone={repo.status === "active" ? "emerald" : "slate"}>
                  {repo.status || "active"}
                </Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
