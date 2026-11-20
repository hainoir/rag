import type { AgentEvent } from "./types.ts";

export type BodyReadStatus = "已读到正文" | "部分读到正文" | "未读到正文";

export function getBodyReadStatus(events: AgentEvent[]): BodyReadStatus {
  const unreadAnswer = events.some(
    (event) =>
      event.type === "answer" &&
      (event.summary.includes("未读到可用于回答的通知全文") || event.summary.includes("未读到通知全文")),
  );
  if (unreadAnswer) return "未读到正文";

  const results = events.filter((event) => event.type === "tool_result" && event.name === "fetch_notice");
  const successes = results.filter((event) => event.type === "tool_result" && event.ok).length;
  if (successes === 0) return "未读到正文";
  return successes < results.length ? "部分读到正文" : "已读到正文";
}
