"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { useSearchHistory } from "@/components/search-history-provider";

type UseSearchNavigationOptions = {
  onSameQuery?: (query: string) => void;
};

export function useSearchNavigation(options?: UseSearchNavigationOptions) {
  const router = useRouter();
  const { addQuery } = useSearchHistory();
  const [isPending, startTransition] = useTransition();

  const submitQuery = (rawQuery: string) => {
    const query = rawQuery.trim();

    if (!query) {
      return false;
    }

    addQuery(query);

    const currentPathname =
      typeof window === "undefined" ? "" : window.location.pathname;
    const currentQuery =
      typeof window === "undefined"
        ? ""
        : (new URLSearchParams(window.location.search).get("q") ?? "").trim();

    if (currentPathname === "/search" && currentQuery === query) {
      options?.onSameQuery?.(query);
      startTransition(() => {
        router.refresh();
      });
      return true;
    }

    startTransition(() => {
      router.push(`/search?q=${encodeURIComponent(query)}`);
    });

    return true;
  };

  return {
    submitQuery,
    isPending,
  };
}
