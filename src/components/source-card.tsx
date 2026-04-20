"use client";

import type { SearchSource } from "@/lib/search/types";
import { formatDateTime, formatFreshnessLabel, formatSourceDate } from "@/lib/utils";
import { QueryHighlight } from "@/components/query-highlight";

type SourceCardProps = {
  source: SearchSource;
  expanded: boolean;
  onToggle: (sourceId: string) => void;
};

export function SourceCard({ source, expanded, onToggle }: SourceCardProps) {
  const isOfficial = source.type === "official";
  const displayText =
    expanded && source.fullSnippet ? source.fullSnippet : source.snippet;
  const freshnessLabel = formatFreshnessLabel(source.freshnessLabel);
  const metadata = [
    { label: "来源站点", value: source.sourceName },
    source.publishedAt ? { label: "发布时间", value: formatSourceDate(source.publishedAt) } : null,
    source.updatedAt ? { label: "最近更新", value: formatDateTime(source.updatedAt) } : null,
    { label: "抓取时间", value: formatDateTime(source.fetchedAt) },
    source.lastVerifiedAt ? { label: "最近校验", value: formatDateTime(source.lastVerifiedAt) } : null,
  ].filter((item): item is { label: string; value: string } => item !== null);
  const canonicalUrl = source.canonicalUrl && source.canonicalUrl !== source.url ? source.canonicalUrl : undefined;

  return (
    <article
      className="surface-strong rounded-[28px] p-5"
      style={{
        borderColor: isOfficial ? "rgba(40,81,61,0.18)" : "rgba(122,74,37,0.18)",
        background: isOfficial
          ? "linear-gradient(180deg, rgba(255,251,247,0.92) 0%, rgba(244,249,246,0.92) 100%)"
          : "linear-gradient(180deg, rgba(255,251,247,0.92) 0%, rgba(249,244,239,0.92) 100%)",
      }}
    >
      <div className="flex flex-wrap items-center gap-3">
        <span
          className="rounded-full px-3 py-1 text-xs font-semibold tracking-[0.16em] uppercase"
          style={{
            background: isOfficial ? "var(--official-soft)" : "var(--community-soft)",
            color: isOfficial ? "var(--official)" : "var(--community)",
          }}
        >
          {isOfficial ? "官方来源" : "社区来源"}
        </span>
        {freshnessLabel ? (
          <span className="rounded-full border border-[var(--line)] bg-white/75 px-3 py-1 text-xs muted">
            {freshnessLabel}
          </span>
        ) : null}
        {typeof source.trustScore === "number" ? (
          <span className="rounded-full border border-[var(--line)] bg-white/75 px-3 py-1 text-xs muted">
            来源权重 {(source.trustScore * 100).toFixed(0)}%
          </span>
        ) : null}
        {!isOfficial ? (
          <span className="rounded-full border border-[var(--line)] bg-white/75 px-3 py-1 text-xs muted">
            经验讨论，仅供参考
          </span>
        ) : null}
      </div>

      <div className="mt-4 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex-1">
          <h3 className="text-lg font-semibold leading-8">{source.title}</h3>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {metadata.map((item) => (
              <div
                className="rounded-[18px] border border-[var(--line)] bg-white/70 px-3 py-2"
                key={`${source.id}-${item.label}`}
              >
                <p className="text-[11px] font-semibold tracking-[0.16em] text-[var(--official)] uppercase">
                  {item.label}
                </p>
                <p className="mt-1 text-sm muted">{item.value}</p>
              </div>
            ))}
          </div>
          <p className="mt-3 text-sm leading-7 muted">
            <QueryHighlight terms={source.matchedKeywords} text={displayText} />
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        {source.url ? (
          <a
            className="rounded-full border border-[var(--line)] bg-white/80 px-4 py-2 text-sm transition hover:border-[var(--official)]"
            href={source.url}
            rel="noreferrer"
            target="_blank"
          >
            查看原文
          </a>
        ) : null}
        {canonicalUrl ? (
          <a
            className="rounded-full border border-[var(--line)] bg-white/80 px-4 py-2 text-sm transition hover:border-[var(--official)]"
            href={canonicalUrl}
            rel="noreferrer"
            target="_blank"
          >
            规范链接
          </a>
        ) : null}
        <button
          className="rounded-full border border-[var(--line)] bg-white/70 px-4 py-2 text-sm transition hover:border-[var(--official)]"
          onClick={() => onToggle(source.id)}
          type="button"
        >
          {expanded ? "收起片段" : "展开片段"}
        </button>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {source.matchedKeywords.map((keyword) => (
          <span
            className="rounded-full border border-[var(--line)] bg-white/80 px-3 py-1 text-xs muted"
            key={`${source.id}-${keyword}`}
          >
            命中：{keyword}
          </span>
        ))}
      </div>
    </article>
  );
}
