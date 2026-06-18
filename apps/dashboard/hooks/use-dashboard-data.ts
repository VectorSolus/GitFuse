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
  historyYears: number[];
  selectedHistoryYear: number;
};

export function useDashboardData(year?: number) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadDashboardData() {
      setLoading(true);
      setError(null);
      setData(null);

      try {
        const params = new URLSearchParams();
        if (year) params.set("year", String(year));
        params.set(
          "tzOffset",
          String(new Date().getTimezoneOffset()),
        );
        const response = await fetch(`/api/dashboard/data?${params.toString()}`, {
          cache: "no-store",
        });
        if (!response.ok) throw new Error(`Dashboard data failed with status ${response.status}`);
        const payload = (await response.json()) as DashboardData;
        if (!cancelled) {
          setData(payload);
          setLoading(false);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Dashboard data unavailable");
          setLoading(false);
        }
      }
    }

    void loadDashboardData();

    return () => {
      cancelled = true;
    };
  }, [year]);

  return { data, error, loading };
}
