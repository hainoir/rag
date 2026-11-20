import type { SearchResponse } from "@/lib/search/types";
import { formatDateTime } from "@/lib/utils";

type LoadingPhase = "idle" | "retrieving" | "summarizing" | "done";

type StatusPanelProps = {
  agentMode?: boolean;
  loadingPhase: LoadingPhase;
  response: SearchResponse | null;
};

function pickLatestTimestamp(values: Array<string | null | undefined>) {
  const normalized = values
    .filter((value): value is string => Boolean(value))
    .map((value) => new Date(value).getTime())
    .filter((value) => Number.isFinite(value));

  if (normalized.length === 0) {
    return undefined;
  }

  return new Date(Math.max(...normalized)).toISOString();
}

export function StatusPanel({ agentMode = false, loadingPhase, response }: StatusPanelProps) {
  const content =
    loadingPhase === "retrieving"
      ? {
          label: "检索中",
          title: "正在从官方信息和社区讨论中召回相关片段",
          body: agentMode
            ? "这里展示并行检索来源；Agent 回答会在上方独立更新。"
            : "这一阶段会优先整理可验证来源，为后续摘要提供依据。",
        }
      : loadingPhase === "summarizing"
        ? {
            label: agentMode ? "来源检索中" : "正在生成摘要",
            title: agentMode ? "正在整理并行检索的来源列表" : "已完成初步检索，正在拼接结论与来源说明",
            body: agentMode
              ? "Agent 回答会在上方独立更新。"
              : "回答会明确区分结论、来源说明和风险提示，避免直接给出不透明的长段落。",
          }
        : response?.status === "empty"
          ? {
              label: agentMode ? "来源检索完成" : "检索完成",
              title: agentMode ? "并行检索没有找到可展示的来源" : "暂未找到足够可靠的信息",
              body: agentMode ? "Agent 回答会在上方独立展示。" : "建议缩小问题范围、补充时间或地点，或者直接查看相近主题的结果。",
            }
          : response?.status === "error"
            ? {
                label: agentMode ? "来源检索失败" : "请求失败",
                title: agentMode ? "并行检索来源暂未加载" : "本次检索未成功完成，可直接重试",
                body: agentMode ? "Agent 回答仍可在上方查看，也可以重试来源列表。" : "这次失败不代表没有相关资料，只是请求链路没有顺利返回结果。",
              }
            : response?.status === "partial"
              ? {
                label: agentMode ? "部分来源" : "部分命中",
                  title: `已找到 ${response.retrievedCount} 条相关来源，但信息仍不完整`,
                  body: "当前结果适合作为方向参考，若涉及政策细节，请继续细化提问或查看原始来源。",
                }
              : {
                label: agentMode ? "来源检索完成" : "检索完成",
                  title: response ? `已找到 ${response.retrievedCount} 条相关来源` : "输入问题后开始检索",
                  body: response
                    ? agentMode
                      ? "这些来源来自并行检索，可与上方 Agent 回答对照。"
                      : "你可以先看摘要，再切换到检索结果视图核对命中片段。"
                    : "支持常见校园问题，例如图书馆借阅、宿舍条件、社团纳新和食堂推荐。",
                };
  const officialCount = response?.sources.filter((source) => source.type === "official").length ?? 0;
  const communityCount = response?.sources.length ? response.sources.length - officialCount : 0;
  const latestVerifiedAt = response
    ? pickLatestTimestamp(response.sources.map((source) => source.lastVerifiedAt ?? source.updatedAt))
    : undefined;

  return (
    <section
      aria-live={loadingPhase === "done" ? "polite" : "assertive"}
      className="surface rounded-[var(--radius-lg)] p-5"
    >
      <div className="mb-3 inline-flex rounded-full bg-[var(--accent-soft)] px-3 py-1 text-xs font-semibold tracking-[0.16em] text-[var(--accent)] uppercase">
        {content.label}
      </div>
      <h2 className="text-xl font-semibold leading-8">{content.title}</h2>
      <p className="mt-2 text-sm leading-7 muted">{content.body}</p>
      {response?.sources.length ? (
        <div className="mt-4 flex flex-wrap gap-2">
          <span className="rounded-full border border-[var(--line)] bg-white/75 px-3 py-1 text-xs muted">
            官方 {officialCount} 条
          </span>
          <span className="rounded-full border border-[var(--line)] bg-white/75 px-3 py-1 text-xs muted">
            社区 {communityCount} 条
          </span>
          <span className="rounded-full border border-[var(--line)] bg-white/75 px-3 py-1 text-xs muted">
            {agentMode ? "来源生成" : "本次回答"} {formatDateTime(response.resultGeneratedAt)}
          </span>
          {latestVerifiedAt ? (
            <span className="rounded-full border border-[var(--line)] bg-white/75 px-3 py-1 text-xs muted">
              最近校验 {formatDateTime(latestVerifiedAt)}
            </span>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
