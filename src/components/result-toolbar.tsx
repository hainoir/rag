"use client";

import type { SourceType, ViewMode } from "@/lib/search/types";
import { cn } from "@/lib/utils";

type ResultToolbarProps = {
  filter: "all" | SourceType;
  onFilterChange: (value: "all" | SourceType) => void;
  viewMode: ViewMode;
  onViewModeChange: (value: ViewMode) => void;
  shownCount: number;
  totalCount: number;
};

const FILTER_ITEMS: Array<{ label: string; value: "all" | SourceType }> = [
  { label: "全部", value: "all" },
  { label: "仅官方", value: "official" },
  { label: "仅社区", value: "community" },
];

const VIEW_ITEMS: Array<{ label: string; value: ViewMode }> = [
  { label: "回答", value: "answer" },
  { label: "检索结果", value: "retrieval" },
];

export function ResultToolbar({
  filter,
  onFilterChange,
  viewMode,
  onViewModeChange,
  shownCount,
  totalCount,
}: ResultToolbarProps) {
  return (
    <section className="surface sticky top-4 z-20 rounded-[var(--radius-lg)] p-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            {FILTER_ITEMS.map((item) => (
              <button
                className={cn(
                  "rounded-full px-4 py-2 text-sm transition",
                  filter === item.value
                    ? "bg-[var(--official)] text-white"
                    : "border border-[var(--line)] bg-white/70 hover:border-[var(--official)]",
                )}
                key={item.value}
                onClick={() => onFilterChange(item.value)}
                type="button"
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {VIEW_ITEMS.map((item) => (
              <button
                className={cn(
                  "rounded-full px-4 py-2 text-sm transition",
                  viewMode === item.value
                    ? "bg-[var(--accent)] text-white"
                    : "border border-[var(--line)] bg-white/70 hover:border-[var(--accent)]",
                )}
                key={item.value}
                onClick={() => onViewModeChange(item.value)}
                type="button"
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-full bg-white/75 px-4 py-2 text-sm text-[var(--muted)]">
          当前展示 {shownCount} / {totalCount} 条来源
        </div>
      </div>
    </section>
  );
}

