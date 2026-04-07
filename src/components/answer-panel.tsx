"use client";

import { useEffect, useState } from "react";

import type { SearchAnswer, SearchStatus } from "@/lib/search/types";

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
    };

export function AnswerPanel(props: AnswerPanelProps) {
  const [visibleCount, setVisibleCount] = useState(
    props.loading ? 0 : props.answer.summary.length,
  );
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

  if (props.loading) {
    return (
      <section className="surface rounded-[var(--radius-lg)] p-6">
        <div className="mb-4 h-5 w-28 animate-pulse rounded-full bg-white/65" />
        <div className="space-y-3">
          <div className="h-8 w-5/6 animate-pulse rounded-2xl bg-white/65" />
          <div className="h-8 w-4/6 animate-pulse rounded-2xl bg-white/65" />
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div className="rounded-[22px] border border-[var(--line)] bg-white/70 p-4" key={index}>
              <div className="h-4 w-24 animate-pulse rounded-full bg-white/65" />
              <div className="mt-4 h-4 w-full animate-pulse rounded-full bg-white/65" />
              <div className="mt-2 h-4 w-5/6 animate-pulse rounded-full bg-white/65" />
            </div>
          ))}
        </div>
      </section>
    );
  }

  const badgeText = props.status === "partial" ? "信息不完整" : "高置信回答";

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
    </section>
  );
}
