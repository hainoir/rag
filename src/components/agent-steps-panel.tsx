"use client";

import { useEffect, useState } from "react";

import type { AgentEvent } from "@/lib/agent/types";

const phaseLabels = {
  received: "收到问题",
  retrieving: "开始检索",
  tool: "调用工具",
  answering: "整理回答",
  done: "完成",
  error: "错误",
  fallback: "回退",
};

export function AgentStepsPanel({ events }: { events: AgentEvent[] }) {
  const [copied, setCopied] = useState(false);

  const citationText = events.find(
    (event) => event.type === "tool_result" && event.name === "export_citations" && event.ok,
  );
  const exportedText = citationText?.type === "tool_result" ? citationText.summary : "";

  useEffect(() => setCopied(false), [exportedText]);

  return (
    <section aria-label="Agent 步骤" aria-live="polite" className="surface rounded-[var(--radius-lg)] p-5 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-xl">Agent 步骤</h2>
        {exportedText ? (
          <button
            className="rounded-full border border-[var(--line-strong)] px-3 py-1 text-xs font-semibold"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(exportedText);
                setCopied(true);
              } catch {
                setCopied(false);
              }
            }}
            type="button"
          >
            {copied ? "已复制引用" : "复制引用"}
          </button>
        ) : null}
      </div>
      <ol className="mt-4 space-y-2 text-sm">
        {events.map((event, index) => (
          <li className="rounded-xl border border-[var(--line)] px-3 py-2" key={`${index}-${event.type}`}>
            {event.type === "phase" ? (
              <span>
                {phaseLabels[event.phase]}
                {event.detail ? ` · ${event.detail}` : ""}
              </span>
            ) : null}
            {event.type === "tool_call" ? <span>调用 {event.name}</span> : null}
            {event.type === "tool_result" ? (
              <span className="whitespace-pre-wrap">
                {event.name} {event.ok ? "✓" : "失败"} · {event.summary}
              </span>
            ) : null}
            {event.type === "answer" ? <span>{event.summary}</span> : null}
            {event.type === "error" ? <span role="alert">{event.message}</span> : null}
          </li>
        ))}
      </ol>
      {events.length === 0 ? <p className="mt-3 text-sm muted">正在连接 Agent…</p> : null}
    </section>
  );
}
