"use client";

import { formatRelativeTime } from "./format";
import { EmptyState, Badge } from "./cards";
import { Activity } from "lucide-react";

export function HistoryTable({ events }: { events: any[] }) {
  if (events.length === 0) {
    return (
      <EmptyState title="No sync activity" icon="activity">
        Run <code className="bg-background text-ocean px-1.5 py-0.5 rounded text-xs mx-1 border border-surface-2">gitfuse sync</code> to push your first bundle.
      </EmptyState>
    );
  }

  return (
    <div className="dark bg-surface border border-surface-2 rounded-xl overflow-hidden shadow-sm">
      <table aria-label="Sync history table" className="w-full border-collapse">
        <thead>
          <tr>
            <th className="bg-surface/50 p-4 text-left text-xs font-bold uppercase text-text-2">Time</th>
            <th className="bg-surface/50 p-4 text-left text-xs font-bold uppercase text-text-2">Repository</th>
            <th className="bg-surface/50 p-4 text-left text-xs font-bold uppercase text-text-2">Device</th>
            <th className="bg-surface/50 p-4 text-left text-xs font-bold uppercase text-text-2">Action</th>
          </tr>
        </thead>
        <tbody>
          {events.map((event: any) => (
            <tr className="hover:bg-background/50 transition-colors" key={event.id}>
              <td className="border-t border-surface-2/50 p-4 text-text">{formatRelativeTime(event.createdAt)}</td>
              <td className="border-t border-surface-2/50 p-4 text-text">
                <span className="font-medium text-text">{event.repositoryName}</span>
              </td>
              <td className="border-t border-surface-2/50 p-4 text-text">{event.deviceName}</td>
              <td className="border-t border-surface-2/50 p-4 text-text">
                <Badge tone={event.eventType === "drop" ? "red" : event.eventType === "pull" ? "emerald" : "blue"}>
                  {event.eventType}
                </Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
