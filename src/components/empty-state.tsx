import { DEFAULT_QUESTIONS } from "@/lib/search/default-questions";
import { SuggestedQuestions } from "@/components/suggested-questions";

type EmptyStateProps = {
  query: string;
  onSameQuery?: (query: string) => void;
};

export function EmptyState({ query, onSameQuery }: EmptyStateProps) {
  return (
    <section className="surface rounded-[var(--radius-lg)] p-6">
      <div className="inline-flex rounded-full bg-[var(--warm-soft)] px-3 py-1 text-xs font-semibold tracking-[0.16em] text-[var(--community)] uppercase">
        无答案兜底
      </div>
      <h2 className="mt-4 font-display text-3xl leading-tight">
        暂未找到足够可靠的信息
      </h2>
      <p className="mt-3 text-sm leading-7 muted">
        {query
          ? `当前没有足够高质量的来源可以直接回答“${query}”。建议改成更具体的问法，例如补充时间、地点或办理对象。`
          : "先输入一个校园问题，系统会优先展示可验证来源。"}
      </p>

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <div className="rounded-[24px] border border-[var(--line)] bg-white/75 p-4">
          <p className="text-xs font-semibold tracking-[0.16em] text-[var(--official)] uppercase">
            建议 1
          </p>
          <p className="mt-3 text-sm leading-7 muted">把问题从“大主题”缩小为“某个流程”或“某个时间点”。</p>
        </div>
        <div className="rounded-[24px] border border-[var(--line)] bg-white/75 p-4">
          <p className="text-xs font-semibold tracking-[0.16em] text-[var(--official)] uppercase">
            建议 2
          </p>
          <p className="mt-3 text-sm leading-7 muted">如果你更关心经验分享，可以明确提到宿舍、食堂或社团等具体场景。</p>
        </div>
        <div className="rounded-[24px] border border-[var(--line)] bg-white/75 p-4">
          <p className="text-xs font-semibold tracking-[0.16em] text-[var(--official)] uppercase">
            建议 3
          </p>
          <p className="mt-3 text-sm leading-7 muted">涉及规则、费用或时间时，请优先查看官方通知，再结合社区经验判断。</p>
        </div>
      </div>

      <div className="mt-8">
        <SuggestedQuestions
          description="可以从这些可演示的主题重新开始。"
          layout="stack"
          onSameQuery={onSameQuery}
          questions={DEFAULT_QUESTIONS}
          title="改问法建议"
        />
      </div>
    </section>
  );
}
