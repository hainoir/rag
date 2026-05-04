import type { SearchSource, ViewMode } from "@/lib/search/types";
import { SourceCard } from "@/components/source-card";

type SourceListProps = {
  mode: ViewMode;
  sources: SearchSource[];
  loading?: boolean;
  expandedSourceIds: string[];
  onToggleExpand: (sourceId: string) => void;
};

export function SourceList({
  mode,
  sources,
  loading = false,
  expandedSourceIds,
  onToggleExpand,
}: SourceListProps) {
  const title = mode === "answer" ? "引用来源" : "命中原始片段";
  const body =
    mode === "answer"
      ? "回答中的关键信息都可以在下面的来源中核对。"
      : "这里直接展示检索命中的原始片段，便于你跳过摘要自行判断。";

  return (
    <section aria-busy={loading} className="space-y-4">
      <div className="space-y-2">
        <h2 className="text-xl font-semibold">{title}</h2>
        <p className="text-sm muted">{body}</p>
      </div>

      {loading ? (
        <div aria-hidden="true" className="space-y-4">
          {Array.from({ length: 3 }).map((_, index) => (
            <div className="surface rounded-[28px] p-5" key={`source-skeleton-${index}`}>
              <div className="h-5 w-32 skeleton-line" />
              <div className="mt-4 h-6 w-3/4 skeleton-line" />
              <div className="mt-3 h-4 w-full skeleton-line" />
              <div className="mt-2 h-4 w-11/12 skeleton-line" />
            </div>
          ))}
        </div>
      ) : sources.length ? (
        <div className="space-y-4">
          {sources.map((source) => (
            <SourceCard
              expanded={expandedSourceIds.includes(source.id)}
              key={source.id}
              onToggle={onToggleExpand}
              source={source}
            />
          ))}
        </div>
      ) : (
        <div className="surface rounded-[var(--radius-lg)] px-5 py-6 text-sm muted">
          当前筛选条件下没有可展示的来源。你可以切回“全部”或切换到另一种来源类型。
        </div>
      )}
    </section>
  );
}
