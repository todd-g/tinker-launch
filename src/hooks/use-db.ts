import { useState, useEffect, useCallback, useRef } from "react";

/**
 * Simple fetch-based hook for querying API routes backed by SQLite.
 * Fetches data from an API route and returns the result.
 * Re-fetches when params change.
 */
export function useDbQuery<T>(
  url: string,
  params?: Record<string, string | undefined>
): { data: T | undefined; loading: boolean; refetch: () => void } {
  const [data, setData] = useState<T | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(true);

  const fetchData = useCallback(async () => {
    try {
      const searchParams = new URLSearchParams();
      if (params) {
        for (const [key, value] of Object.entries(params)) {
          if (value !== undefined) {
            searchParams.set(key, value);
          }
        }
      }
      const queryString = searchParams.toString();
      const fullUrl = queryString ? `${url}?${queryString}` : url;
      const res = await fetch(fullUrl);
      const json = await res.json();
      if (mountedRef.current) {
        setData(json);
        setLoading(false);
      }
    } catch {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, [url, params ? JSON.stringify(params) : ""]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    mountedRef.current = true;
    setLoading(true);
    fetchData();
    return () => {
      mountedRef.current = false;
    };
  }, [fetchData]);

  return { data, loading, refetch: fetchData };
}

/**
 * Simple fetch-based mutation helper.
 */
export function useDbMutation(url: string) {
  const [loading, setLoading] = useState(false);

  const mutate = useCallback(
    async (body: unknown) => {
      setLoading(true);
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const json = await res.json();
        setLoading(false);
        return json;
      } catch (error) {
        setLoading(false);
        throw error;
      }
    },
    [url]
  );

  return { mutate, loading };
}
