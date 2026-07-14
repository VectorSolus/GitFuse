"use client";

import { useCallback, useEffect, useState } from "react";
import type { DashboardBilling } from "@/lib/billing";
import type { DashboardDeviceSummary } from "@/lib/device-summary";
import type { DashboardDevice } from "@/lib/devices";
import type { DashboardSyncEvent } from "@/lib/history";
import type { DashboardRepository } from "@/lib/repositories";
import type { DashboardUsage } from "@/lib/usage";
import type { PairingSecuritySummary } from "@/lib/pairing-pin";
import type { AccountLimitsResponse } from "@gitfuse/types/billing";

export type DashboardData = {
  user: {
    name: string;
    email: string;
  };
  repositories: DashboardRepository[];
  devices: DashboardDevice[];
  deviceSummary?: DashboardDeviceSummary;
  history: DashboardSyncEvent[];
  usage: DashboardUsage;
  accountLimits: AccountLimitsResponse;
  billing: DashboardBilling;
  security: PairingSecuritySummary;
  authProviders: {
    github: boolean;
    google: boolean;
  };
  historyYears: number[];
  selectedHistoryYear: number;
};

export function useDashboardData(year?: number) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshIndex, setRefreshIndex] = useState(0);

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
        const [response, limitsResponse] = await Promise.all([
          fetch(`/api/dashboard/data?${params.toString()}`, {
            cache: "no-store",
          }),
          fetch("/api/account/limits", {
            cache: "no-store",
          }),
        ]);
        if (!response.ok) throw new Error(`Dashboard data failed with status ${response.status}`);
        if (!limitsResponse.ok) throw new Error(`Account limits failed with status ${limitsResponse.status}`);
        const payload = (await response.json()) as DashboardData;
        payload.accountLimits = (await limitsResponse.json()) as AccountLimitsResponse;
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
  }, [year, refreshIndex]);

  const refresh = useCallback(() => {
    setRefreshIndex((current) => current + 1);
  }, []);

  return { data, error, loading, refresh };
}
