import type { AgentEvent } from "@/lib/agent/types";
import { getBodyReadStatus } from "@/lib/agent/body-read-status";

type AgentAnswer = Extract<AgentEvent, { type: "answer" }>;

export function AgentAnswerPanel({
  answer,
  events,
  error,
}: {
  answer?: AgentAnswer;
  events: AgentEvent[];
  error: string | null;
}) {
  return (
    <section aria-label="Agent 回答" aria-busy={!answer && !error} className="surface rounded-[var(--radius-lg)] p-6">
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <h2 className="rounded-full bg-[var(--accent-soft)] px-3 py-1 text-xs font-semibold tracking-[0.16em] text-[var(--accent)] uppercase">
          Agent 回答
        </h2>
        {answer ? (
          <span className="rounded-full border border-[var(--line)] px-3 py-1 text-xs">
            {getBodyReadStatus(events)}
          </span>
        ) : null}
        {answer?.fallback ? (
          <span className="rounded-full border border-[var(--line)] px-3 py-1 text-xs">回退回答</span>
        ) : null}
      </div>
      {answer ? (
        <p className="whitespace-pre-wrap font-display text-3xl leading-tight md:text-[2.5rem]">{answer.summary}</p>
      ) : error ? (
        <p role="alert">{error}</p>
      ) : (
        <p>Agent 正在整理回答…</p>
      )}
      {answer?.procedure ? (
        <div className="mt-6 space-y-6">
          <div>
            <h3 className="font-semibold">办理步骤</h3>
            <ol className="mt-2 list-decimal space-y-3 pl-6">
              {answer.procedure.steps.map((item, index) => (
                <li key={`${item.evidence.documentId}-step-${index}`}>
                  <p className="whitespace-pre-wrap">{item.text}</p>
                  <p className="mt-1 text-sm muted">来源：{item.evidence.title}</p>
                </li>
              ))}
            </ol>
          </div>
          {answer.procedure.exceptions.length ? (
            <div>
              <h3 className="font-semibold">特殊情况</h3>
              <ul className="mt-2 list-disc space-y-3 pl-6">
                {answer.procedure.exceptions.map((item, index) => (
                  <li key={`${item.evidence.documentId}-exception-${index}`}>
                    <p className="whitespace-pre-wrap">{item.text}</p>
                    <p className="mt-1 text-sm muted">来源：{item.evidence.title}</p>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {answer.procedure.verify.length ? (
            <div>
              <h3 className="font-semibold">仍需核对原文</h3>
              <ul className="mt-2 list-disc space-y-3 pl-6">
                {answer.procedure.verify.map((item, index) => (
                  <li key={`${item.evidence.documentId}-verify-${index}`}>
                    <p className="whitespace-pre-wrap">{item.text}</p>
                    <p className="mt-1 text-sm muted">来源：{item.evidence.title}</p>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
      {answer?.citations.length ? (
        <div className="mt-6">
          <h3 className="font-semibold">引用来源</h3>
          <ul className="mt-2 space-y-2 text-sm">
            {answer.citations.map((citation, index) => (
              <li key={`${citation.sourceId}-${index}`}>
                {citation.title} · {citation.sourceName}
                {citation.snippet ? ` · ${citation.snippet}` : ""}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {answer?.evidence?.length ? (
        <div className="mt-6">
          <h3 className="font-semibold">依据片段</h3>
          <ul className="mt-2 space-y-2 text-sm">
            {answer.evidence.map((item, index) => (
              <li className="rounded-xl border border-[var(--line)] p-3" key={`${item.sourceId}-${index}`}>
                {item.title} · {item.sourceName}
                <p className="mt-1 whitespace-pre-wrap muted">{item.snippet}</p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
