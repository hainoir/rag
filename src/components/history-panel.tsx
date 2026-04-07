"use client";

import { useSearchNavigation } from "@/hooks/use-search-navigation";
import { useSearchHistory } from "@/components/search-history-provider";

type HistoryPanelProps = {
  title?: string;
  onSameQuery?: (query: string) => void;
};

export function HistoryPanel({
  title = "最近搜索",
  onSameQuery,
}: HistoryPanelProps) {
  const { history, hydrated, clearHistory } = useSearchHistory();
  const { submitQuery, isPending } = useSearchNavigation({
    onSameQuery,
  });

  return (
    <section className="surface rounded-[var(--radius-lg)] p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold tracking-[0.18em] text-[var(--official)] uppercase">
            {title}
          </h2>
          <p className="mt-1 text-sm muted">本地保存最近 6 条问题，便于快速重查。</p>
        </div>
        <button
          className="text-sm text-[var(--muted)] transition hover:text-[var(--official)]"
          onClick={clearHistory}
          type="button"
        >
          清空
        </button>
      </div>

      {!hydrated ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div
              className="h-12 animate-pulse rounded-2xl bg-white/60"
              key={`history-skeleton-${index}`}
            />
          ))}
        </div>
      ) : history.length ? (
        <div className="space-y-3">
          {history.map((question) => (
            <button
              className="flex w-full items-center justify-between rounded-2xl border border-[var(--line)] bg-white/70 px-4 py-3 text-left transition hover:border-[var(--official)] hover:bg-white"
              disabled={isPending}
              key={question}
              onClick={() => submitQuery(question)}
              type="button"
            >
              <span className="font-medium">{question}</span>
              <span className="text-xs muted">重新检索</span>
            </button>
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-[var(--line)] bg-white/50 px-4 py-6 text-sm muted">
          还没有历史问题。先试试“图书馆怎么借书？”或“食堂推荐哪个窗口？”。
        </div>
      )}
    </section>
  );
}

