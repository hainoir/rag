"use client";

import { useEffect, useState, type FormEvent } from "react";

import { useSearchNavigation } from "@/hooks/use-search-navigation";
import { cn } from "@/lib/utils";

type SearchBoxProps = {
  initialValue?: string;
  compact?: boolean;
  autoFocus?: boolean;
  onSameQuery?: (query: string) => void;
};

export function SearchBox({
  initialValue = "",
  compact = false,
  autoFocus = false,
  onSameQuery,
}: SearchBoxProps) {
  const [query, setQuery] = useState(initialValue);
  const { submitQuery, isPending } = useSearchNavigation({
    onSameQuery,
  });

  useEffect(() => {
    setQuery(initialValue);
  }, [initialValue]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    submitQuery(query);
  };

  return (
    <form
      className={cn(
        "surface rounded-[var(--radius-lg)] p-2",
        compact ? "w-full" : "w-full max-w-4xl",
      )}
      onSubmit={handleSubmit}
    >
      <div
        className={cn(
          "flex gap-2",
          compact ? "flex-col sm:flex-row" : "flex-col md:flex-row md:items-center",
        )}
      >
        <label className="sr-only" htmlFor="campus-search-input">
          输入校园问题
        </label>
        <div className="relative flex-1">
          <input
            autoFocus={autoFocus}
            className={cn(
              "w-full rounded-[calc(var(--radius-lg)-10px)] border border-transparent bg-white/70 px-5 py-4 text-base text-[var(--ink)] outline-none transition",
              "placeholder:text-[color:var(--muted)] focus:border-[color:var(--accent)] focus:bg-white",
              compact ? "min-h-[56px]" : "min-h-[64px] text-lg",
            )}
            id="campus-search-input"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="例如：图书馆怎么借书？"
            value={query}
          />
          <div className="pointer-events-none absolute right-4 top-1/2 hidden -translate-y-1/2 rounded-full bg-[var(--accent-soft)] px-3 py-1 text-xs text-[var(--accent)] md:block">
            检索优先，回答可追溯
          </div>
        </div>
        <button
          className={cn(
            "rounded-[calc(var(--radius-lg)-10px)] bg-[var(--official)] px-6 py-4 text-sm font-semibold text-white transition hover:bg-[color:#1f4333]",
            "disabled:cursor-not-allowed disabled:opacity-60",
            compact ? "sm:min-w-[124px]" : "md:min-w-[148px]",
          )}
          disabled={!query.trim() || isPending}
          type="submit"
        >
          {isPending ? "跳转中..." : "开始检索"}
        </button>
      </div>
    </form>
  );
}

