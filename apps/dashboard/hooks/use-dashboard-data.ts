"use client";

import { useEffect, useState } from "react";
import type { DashboardBilling } from "@/lib/billing";
import type { DashboardDevice } from "@/lib/devices";
import type { DashboardSyncEvent } from "@/lib/history";
import type { DashboardRepository } from "@/lib/repositories";
import type { DashboardUsage } from "@/lib/usage";

export type DashboardData = {
  user: {
    name: string;
    email: string;
  };
  repositories: DashboardRepository[];
  devices: DashboardDevice[];
  history: DashboardSyncEvent[];
  usage: DashboardUsage;
  billing: DashboardBilling;
};

export function useDashboardData() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadDashboardData() {
      try {
        const response = await fetch("/api/dashboard/data", { cache: "no-store" });
        if (!response.ok) throw new Error(`Dashboard data failed with status ${response.status}`);
        const payload = (await response.json()) as DashboardData;
        if (!cancelled) setData(payload);
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Dashboard data unavailable");
        }
      }
    }

    void loadDashboardData();

    return () => {
      cancelled = true;
    };
  }, []);

  return { data, error };
}
