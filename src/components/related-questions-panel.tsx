"use client";

import type { SearchResponse } from "@/lib/search/types";
import { formatResultGeneratedAt } from "@/lib/utils";
import { SuggestedQuestions } from "@/components/suggested-questions";

type RelatedQuestionsPanelProps = {
  response: SearchResponse | null;
  onSameQuery?: (query: string) => void;
};

export function RelatedQuestionsPanel({
  response,
  onSameQuery,
}: RelatedQuestionsPanelProps) {
  const statusLabel =
    response?.status === "error"
      ? "这次检索失败了，但这不等于当前主题没有资料。"
      : response?.status === "partial"
      ? "当前结果为部分命中，建议优先看原始来源。"
      : response?.status === "empty"
        ? "没有可靠来源时不会强行生成答案。"
        : "默认优先展示官方来源，再补充社区经验。";

  return (
    <div className="grid gap-4">
      <div className="surface rounded-[var(--radius-lg)] p-5">
        <SuggestedQuestions
          description="从当前主题继续追问，能更快形成一组完整的校园信息链路。"
          layout="stack"
          onSameQuery={onSameQuery}
          questions={response?.relatedQuestions ?? []}
          title="相关问题推荐"
        />
      </div>

      <div className="surface rounded-[var(--radius-lg)] p-5">
        <h2 className="text-sm font-semibold tracking-[0.18em] text-[var(--official)] uppercase">
          回答说明
        </h2>
        <p className="mt-4 text-sm leading-7 muted">
          这个页面不是只输出结论，而是把问答摘要、来源层级和检索片段一起展示出来，方便你判断信息是否值得采信。
        </p>
        <div className="mt-4 rounded-[22px] border border-[var(--line)] bg-white/75 p-4 text-sm leading-7 muted">
          {statusLabel}
        </div>
      </div>

      <div className="surface rounded-[var(--radius-lg)] p-5">
        <h2 className="text-sm font-semibold tracking-[0.18em] text-[var(--official)] uppercase">
          结果时间提示
        </h2>
        <p className="mt-4 text-sm leading-7 muted">
          {response
            ? response.status === "error"
              ? `本次检索失败于 ${formatResultGeneratedAt(response.resultGeneratedAt)}。如果你怀疑是临时请求问题，可以直接重新检索。`
              : `本次结果生成于 ${formatResultGeneratedAt(response.resultGeneratedAt)}。如果问题涉及近期政策或营业安排，请回到原始通知再次核验。`
            : "发起检索后，这里会展示结果生成时间和可信度说明。"}
        </p>
      </div>
    </div>
  );
}
