"use client";

import { useEffect, useState } from "react";

import type { SearchAnswer, SearchStatus } from "@/lib/search/types";

type FeedbackState = "idle" | "submitting" | "sent" | "failed";

type AnswerPanelProps =
  | {
      loading: true;
      answer?: never;
      status?: never;
    }
  | {
      loading?: false;
      answer: SearchAnswer;
      status: SearchStatus;
      query?: string;
      requestId?: string;
      sourceIds?: string[];
    };

export function AnswerPanel(props: AnswerPanelProps) {
  const [visibleCount, setVisibleCount] = useState(
    props.loading ? 0 : props.answer.summary.length,
  );
  const [feedbackState, setFeedbackState] = useState<FeedbackState>("idle");
  const summaryText = props.loading ? "" : props.answer.summary;

  useEffect(() => {
    if (props.loading) {
      return;
    }

    setVisibleCount(0);

    const timer = window.setInterval(() => {
      setVisibleCount((current) => {
        const nextValue = current + 3;

        if (nextValue >= summaryText.length) {
          window.clearInterval(timer);
          return summaryText.length;
        }

        return nextValue;
      });
    }, 18);

    return () => {
      window.clearInterval(timer);
    };
  }, [props.loading, summaryText]);

  useEffect(() => {
    setFeedbackState("idle");
  }, [props.loading ? "" : props.requestId]);

  if (props.loading) {
    return (
      <section
        aria-busy="true"
        aria-label="正在生成回答摘要"
        className="surface rounded-[var(--radius-lg)] p-6"
      >
        <div aria-hidden="true" className="mb-4 h-5 w-28 skeleton-line" />
        <div aria-hidden="true" className="space-y-3">
          <div className="h-8 w-5/6 skeleton-line" />
          <div className="h-8 w-4/6 skeleton-line" />
        </div>
        <div aria-hidden="true" className="mt-6 grid gap-4 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div className="rounded-[22px] border border-[var(--line)] bg-white/70 p-4" key={index}>
              <div className="h-4 w-24 skeleton-line" />
              <div className="mt-4 h-4 w-full skeleton-line" />
              <div className="mt-2 h-4 w-5/6 skeleton-line" />
            </div>
          ))}
        </div>
      </section>
    );
  }

  const badgeText = props.status === "partial" ? "信息不完整" : "高置信回答";
  const evidence = props.answer.evidence ?? [];
  const { query, requestId, sourceIds } = props;
  const canSendFeedback = Boolean(requestId && query);

  async function submitFeedback(rating: "up" | "down") {
    if (!canSendFeedback || feedbackState === "submitting") {
      return;
    }

    setFeedbackState("submitting");

    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          requestId,
          query,
          rating,
          sourceIds: sourceIds ?? evidence.map((item) => item.sourceId),
        }),
      });

      setFeedbackState(response.ok ? "sent" : "failed");
    } catch {
      setFeedbackState("failed");
    }
  }

  return (
    <section className="surface rounded-[var(--radius-lg)] p-6">
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <span className="rounded-full bg-[var(--accent-soft)] px-3 py-1 text-xs font-semibold tracking-[0.16em] text-[var(--accent)] uppercase">
          回答摘要
        </span>
        <span className="rounded-full border border-[var(--line)] bg-white/75 px-3 py-1 text-xs text-[var(--muted)]">
          {badgeText}
        </span>
        <span className="rounded-full border border-[var(--line)] bg-white/75 px-3 py-1 text-xs text-[var(--muted)]">
          置信度 {(props.answer.confidence * 100).toFixed(0)}%
        </span>
      </div>

      <p className="font-display text-3xl leading-tight md:text-[2.5rem]">
        {props.answer.summary.slice(0, visibleCount)}
      </p>

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <article className="rounded-[24px] border border-[var(--line)] bg-white/78 p-4">
          <p className="text-xs font-semibold tracking-[0.16em] text-[var(--official)] uppercase">
            结论摘要
          </p>
          <p className="mt-3 text-sm leading-7 muted">{props.answer.summary}</p>
        </article>
        <article className="rounded-[24px] border border-[var(--line)] bg-white/78 p-4">
          <p className="text-xs font-semibold tracking-[0.16em] text-[var(--official)] uppercase">
            信息来源
          </p>
          <p className="mt-3 text-sm leading-7 muted">{props.answer.sourceNote}</p>
        </article>
        <article className="rounded-[24px] border border-[var(--line)] bg-white/78 p-4">
          <p className="text-xs font-semibold tracking-[0.16em] text-[var(--official)] uppercase">
            补充说明
          </p>
          <p className="mt-3 text-sm leading-7 muted">{props.answer.disclaimer}</p>
        </article>
      </div>

      {evidence.length > 0 ? (
        <div className="mt-4 rounded-[24px] border border-[var(--line)] bg-white/78 p-4">
          <p className="text-xs font-semibold tracking-[0.16em] text-[var(--official)] uppercase">
            依据片段
          </p>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {evidence.map((item) => (
              <div
                className="rounded-[18px] border border-[var(--line)] bg-white/72 p-3"
                key={item.sourceId}
              >
                <p className="text-sm font-semibold leading-6">{item.title}</p>
                {item.sourceName ? (
                  <p className="mt-1 text-xs muted">{item.sourceName}</p>
                ) : null}
                {item.snippet ? (
                  <p className="mt-2 text-sm leading-6 muted">{item.snippet}</p>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-[20px] border border-[var(--line)] bg-white/78 p-4">
        <p className="text-sm leading-6 muted">
          {feedbackState === "sent"
            ? "反馈已记录。"
            : feedbackState === "failed"
              ? "反馈暂未提交成功。"
              : "这次回答是否有帮助？"}
        </p>
        <div className="flex items-center gap-2">
          <button
            className="rounded-full border border-[var(--line)] bg-white px-4 py-2 text-sm font-semibold text-[var(--official)] transition hover:border-[var(--official)] disabled:cursor-not-allowed disabled:opacity-55"
            disabled={!canSendFeedback || feedbackState === "submitting"}
            onClick={() => void submitFeedback("up")}
            type="button"
          >
            有帮助
          </button>
          <button
            className="rounded-full border border-[var(--line)] bg-white px-4 py-2 text-sm font-semibold text-[var(--muted)] transition hover:border-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-55"
            disabled={!canSendFeedback || feedbackState === "submitting"}
            onClick={() => void submitFeedback("down")}
            type="button"
          >
            不准确
          </button>
        </div>
      </div>
    </section>
  );
}
