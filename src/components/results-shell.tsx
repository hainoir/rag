"use client";

import { useEffect, useState } from "react";

import { AnswerPanel } from "@/components/answer-panel";
import { EmptyState } from "@/components/empty-state";
import { RelatedQuestionsPanel } from "@/components/related-questions-panel";
import { ResultToolbar } from "@/components/result-toolbar";
import { SearchBox } from "@/components/search-box";
import { SourceList } from "@/components/source-list";
import { StatusPanel } from "@/components/status-panel";
import { mockSearchProvider } from "@/lib/search/search-provider";
import type { SearchResponse, SourceType, ViewMode } from "@/lib/search/types";

type LoadingPhase = "idle" | "retrieving" | "summarizing" | "done";

type ResultsShellProps = {
  initialQuery: string;
};

const SEARCH_DELAY_MS = 420;

function wait(ms: number) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

export function ResultsShell({ initialQuery }: ResultsShellProps) {
  const [response, setResponse] = useState<SearchResponse | null>(null);
  const [loadingPhase, setLoadingPhase] = useState<LoadingPhase>("idle");
  const [filter, setFilter] = useState<"all" | SourceType>("all");
  const [viewMode, setViewMode] = useState<ViewMode>("answer");
  const [expandedSourceIds, setExpandedSourceIds] = useState<string[]>([]);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function loadSearch() {
      if (!initialQuery.trim()) {
        setResponse(null);
        setLoadingPhase("done");
        return;
      }

      setExpandedSourceIds([]);
      setLoadingPhase("retrieving");
      setResponse(null);

      await wait(SEARCH_DELAY_MS);

      if (cancelled) {
        return;
      }

      setLoadingPhase("summarizing");
      const nextResponse = await mockSearchProvider.search(initialQuery);

      if (cancelled) {
        return;
      }

      setResponse(nextResponse);
      setLoadingPhase("done");
    }

    loadSearch();

    return () => {
      cancelled = true;
    };
  }, [initialQuery, reloadToken]);

  const filteredSources =
    filter === "all"
      ? response?.sources ?? []
      : (response?.sources ?? []).filter((source) => source.type === filter);

  const toggleExpand = (sourceId: string) => {
    setExpandedSourceIds((current) =>
      current.includes(sourceId)
        ? current.filter((item) => item !== sourceId)
        : [...current, sourceId],
    );
  };

  const handleSameQuery = () => {
    setReloadToken((current) => current + 1);
  };

  const queryHeading = initialQuery.trim() || "先输入一个校园问题";

  return (
    <main className="page-shell">
      <div className="mx-auto max-w-7xl">
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_340px]">
          <div className="space-y-6">
            <section className="surface rounded-[32px] p-6 md:p-8">
              <div className="flex flex-wrap items-center gap-3">
                <span className="highlight text-xs font-semibold tracking-[0.18em] uppercase">
                  结果页
                </span>
                <span className="highlight text-xs font-semibold tracking-[0.18em] uppercase">
                  来源过滤
                </span>
                <span className="highlight text-xs font-semibold tracking-[0.18em] uppercase">
                  可解释回答
                </span>
              </div>

              <h1 className="mt-5 font-display text-3xl leading-tight md:text-5xl">
                {queryHeading}
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-7 muted">
                回答会优先展示结论摘要与来源说明；如果你更想核对依据，可以直接切到检索结果视图查看原始命中片段。
              </p>

              <div className="mt-6">
                <SearchBox compact initialValue={initialQuery} onSameQuery={handleSameQuery} />
              </div>
            </section>

            <StatusPanel loadingPhase={loadingPhase} response={response} />

            {initialQuery.trim() ? (
              <>
                <ResultToolbar
                  filter={filter}
                  onFilterChange={setFilter}
                  onViewModeChange={setViewMode}
                  shownCount={filteredSources.length}
                  totalCount={response?.sources.length ?? 0}
                  viewMode={viewMode}
                />

                {loadingPhase !== "done" ? (
                  <>
                    <AnswerPanel loading />
                    <SourceList
                      expandedSourceIds={expandedSourceIds}
                      loading
                      mode={viewMode}
                      onToggleExpand={toggleExpand}
                      sources={[]}
                    />
                  </>
                ) : response?.status === "empty" ? (
                  <EmptyState onSameQuery={handleSameQuery} query={initialQuery} />
                ) : (
                  <>
                    {viewMode === "answer" ? (
                      <AnswerPanel answer={response!.answer!} status={response!.status} />
                    ) : null}

                    <SourceList
                      expandedSourceIds={expandedSourceIds}
                      mode={viewMode}
                      onToggleExpand={toggleExpand}
                      sources={filteredSources}
                    />
                  </>
                )}
              </>
            ) : (
              <EmptyState onSameQuery={handleSameQuery} query="" />
            )}
          </div>

          <aside className="xl:sticky xl:top-4 xl:self-start">
            <RelatedQuestionsPanel onSameQuery={handleSameQuery} response={response} />
          </aside>
        </div>
      </div>
    </main>
  );
}
