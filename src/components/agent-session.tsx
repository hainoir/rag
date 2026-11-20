"use client";

import { AgentAnswerPanel } from "@/components/agent-answer-panel";
import { AgentStepsPanel } from "@/components/agent-steps-panel";
import { useAgentStream } from "@/hooks/use-agent-stream";

export function AgentSession({ query }: { query: string }) {
  const { events, error, completed, retry } = useAgentStream({ query });
  const answer = events.findLast((event) => event.type === "answer");
  const message =
    error === "disconnect"
      ? "Agent 连接中断，可以重新运行。"
      : error === "parse"
        ? "Agent 返回的数据无法读取，可以重新运行。"
        : error === "agent"
          ? "Agent 运行遇到问题，可以重新运行。"
          : completed && !answer
            ? "Agent 未返回可用回答，可以重新运行。"
            : null;

  return (
    <div className="space-y-6">
      <AgentAnswerPanel answer={answer} error={message} events={events} />
      {message ? (
        <div className="flex flex-wrap items-center gap-3" role="alert">
          <span>{message}</span>
          <button
            className="rounded-full border border-[var(--line-strong)] px-4 py-2 text-sm font-semibold"
            onClick={retry}
            type="button"
          >
            重新运行 Agent
          </button>
        </div>
      ) : null}
      <AgentStepsPanel events={events} />
    </div>
  );
}
