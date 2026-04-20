import { DEFAULT_QUESTIONS } from "@/lib/search/default-questions";
import { SuggestedQuestions } from "@/components/suggested-questions";

type ErrorStateProps = {
  query: string;
  onRetry: (query: string) => void;
  onSameQuery?: (query: string) => void;
};

export function ErrorState({ query, onRetry, onSameQuery }: ErrorStateProps) {
  return (
    <section className="surface rounded-[var(--radius-lg)] p-6">
      <div className="inline-flex rounded-full bg-[var(--warm-soft)] px-3 py-1 text-xs font-semibold tracking-[0.16em] text-[var(--community)] uppercase">
        请求失败
      </div>
      <h2 className="mt-4 font-display text-3xl leading-tight">本次检索未成功完成</h2>
      <p className="mt-3 text-sm leading-7 muted">
        {query
          ? `系统这次没能完成“${query}”的检索请求。这和“没有相关结果”不是一回事，你可以直接重试，或先换一个更具体的问题。`
          : "系统这次没能完成检索请求。你可以直接重试，或先换一个更具体的问题。"}
      </p>

      <div className="mt-6 flex flex-wrap gap-3">
        <button
          className="rounded-full bg-[var(--official)] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[color:#1f4333]"
          onClick={() => onRetry(query)}
          type="button"
        >
          重新检索
        </button>
        <div className="rounded-full border border-[var(--line)] bg-white/75 px-4 py-3 text-sm muted">
          失败态不会伪装成“无答案”。
        </div>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <div className="rounded-[24px] border border-[var(--line)] bg-white/75 p-4">
          <p className="text-xs font-semibold tracking-[0.16em] text-[var(--official)] uppercase">
            说明 1
          </p>
          <p className="mt-3 text-sm leading-7 muted">请求失败表示本次链路没有走通，不代表当前主题一定没有资料。</p>
        </div>
        <div className="rounded-[24px] border border-[var(--line)] bg-white/75 p-4">
          <p className="text-xs font-semibold tracking-[0.16em] text-[var(--official)] uppercase">
            说明 2
          </p>
          <p className="mt-3 text-sm leading-7 muted">如果是临时网络问题，直接重试通常就能恢复。</p>
        </div>
        <div className="rounded-[24px] border border-[var(--line)] bg-white/75 p-4">
          <p className="text-xs font-semibold tracking-[0.16em] text-[var(--official)] uppercase">
            说明 3
          </p>
          <p className="mt-3 text-sm leading-7 muted">如果你赶时间，也可以先点下面的推荐问题继续演示项目主流程。</p>
        </div>
      </div>

      <div className="mt-8">
        <SuggestedQuestions
          description="可以先切到这些稳定可演示的主题。"
          layout="stack"
          onSameQuery={onSameQuery}
          questions={DEFAULT_QUESTIONS}
          title="继续检索建议"
        />
      </div>
    </section>
  );
}
