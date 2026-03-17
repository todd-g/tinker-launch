"use client";

import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useCallback, useMemo } from "react";

export type DateRange = "today" | "week" | "month" | "all";

export interface ActivityFilters {
  dateRange: DateRange;
  projectId: string; // "all" or project ID
  org: string; // "all" or org name
}

export interface ActivityFilterActions {
  setDateRange: (range: DateRange) => void;
  setProjectId: (id: string) => void;
  setOrg: (org: string) => void;
}

export interface DateRangeResult {
  startDate: string;
  endDate: string;
}

function toLocalDateString(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function getDateRange(range: DateRange): DateRangeResult | undefined {
  if (range === "all") return undefined;
  const now = new Date();
  const endDate = toLocalDateString(now);
  switch (range) {
    case "today":
      return { startDate: endDate, endDate };
    case "week": {
      const d = new Date(now);
      d.setDate(d.getDate() - 6);
      return { startDate: toLocalDateString(d), endDate };
    }
    case "month": {
      const d = new Date(now);
      d.setDate(d.getDate() - 29);
      return { startDate: toLocalDateString(d), endDate };
    }
  }
}

const VALID_RANGES: DateRange[] = ["today", "week", "month", "all"];

export function useActivityFilters(): ActivityFilters & ActivityFilterActions & { queryParams: Record<string, string> } {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const dateRange = useMemo(() => {
    const v = searchParams.get("range") as DateRange | null;
    return v && VALID_RANGES.includes(v) ? v : "today";
  }, [searchParams]);

  const projectId = searchParams.get("project") || "all";
  const org = searchParams.get("org") || "all";

  const updateParam = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value === "all" || value === "today") {
        params.delete(key);
      } else {
        params.set(key, value);
      }
      const qs = params.toString();
      router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
    },
    [searchParams, router, pathname]
  );

  const setDateRange = useCallback((range: DateRange) => updateParam("range", range), [updateParam]);
  const setProjectId = useCallback((id: string) => updateParam("project", id), [updateParam]);
  const setOrg = useCallback((org: string) => updateParam("org", org), [updateParam]);

  // Build query params for API calls
  const queryParams = useMemo(() => {
    const params: Record<string, string> = {};
    const range = getDateRange(dateRange);
    if (range) {
      params.startDate = range.startDate;
      params.endDate = range.endDate;
    }
    if (projectId !== "all") params.projectId = projectId;
    if (org !== "all") params.org = org;
    return params;
  }, [dateRange, projectId, org]);

  return { dateRange, projectId, org, setDateRange, setProjectId, setOrg, queryParams };
}
