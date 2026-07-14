"use client";

import { formatRelativeTime } from "./format";
import { EmptyState, Badge } from "./cards";
import { Laptop } from "lucide-react";

export function DevicesTable({ devices }: { devices: any[] }) {
  if (devices.length === 0) {
    return (
      <EmptyState title="No devices registered" icon="laptop">
        Run <code className="bg-background text-ocean px-1.5 py-0.5 rounded text-xs mx-1 border border-surface-2">gitfuse auth</code> on your machine to link it.
      </EmptyState>
    );
  }

  return (
    <div className="dark bg-surface border border-surface-2 rounded-xl overflow-hidden shadow-sm">
      <table aria-label="Devices table" className="w-full border-collapse">
        <thead>
          <tr>
            <th className="bg-surface/50 p-4 text-left text-xs font-bold uppercase text-text-2">Name</th>
            <th className="bg-surface/50 p-4 text-left text-xs font-bold uppercase text-text-2">Last active</th>
            <th className="bg-surface/50 p-4 text-left text-xs font-bold uppercase text-text-2">Status</th>
            <th className="bg-surface/50 p-4 text-center text-xs font-bold uppercase text-text-2">Action</th>
          </tr>
        </thead>
        <tbody>
          {devices.map((device: any) => (
            <tr className="hover:bg-background/50 transition-colors" key={device.id}>
              <td className="border-t border-surface-2/50 p-4 text-text">
                <div className="flex items-center gap-3">
                  <Laptop className="w-5 h-5 text-ocean" />
                  <span className="font-medium text-text">{device.name}</span>
                </div>
              </td>
              <td className="border-t border-surface-2/50 p-4 text-text">{device.lastActiveAt ? formatRelativeTime(device.lastActiveAt) : "Never"}</td>
              <td className="border-t border-surface-2/50 p-4 text-text">
                <Badge tone={device.status === "active" ? "emerald" : "slate"}>
                  {device.status || "active"}
                </Badge>
              </td>
              <td className="border-t border-surface-2/50 p-4 text-text">
                <div className="flex justify-center">
                  <button className="border border-red-500/50 hover:bg-red-500/10 text-red-400 font-medium py-1 px-3 rounded text-sm transition-colors">
                    Revoke
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
