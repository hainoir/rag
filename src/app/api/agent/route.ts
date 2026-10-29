import { runCampusAgent } from "@/lib/agent/orchestrator";
import { encodeAgentDone, encodeAgentEvent } from "@/lib/agent/sse";
import type { AgentEvent } from "@/lib/agent/types";
import { createSearchRequestId } from "@/lib/search/response-meta";
import { checkSearchRateLimit } from "@/lib/search/search-gateway";
import { createRedisKeyValueStore } from "@/lib/server/redis-store";

export const runtime = "nodejs";

function getClientId(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const realIp = request.headers.get("x-real-ip")?.trim();

  return forwardedFor || realIp || "local";
}

export function GET(request: Request) {
  const requestId = createSearchRequestId();
  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  const encoder = new TextEncoder();
  let closed = false;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const emit = (event: AgentEvent) => {
        if (closed) return;

        try {
          controller.enqueue(encoder.encode(encodeAgentEvent(event)));
        } catch {
          closed = true;
        }
      };

      void (async () => {
        try {
          const rateLimit = await checkSearchRateLimit(createRedisKeyValueStore(), getClientId(request));

          if (!rateLimit.allowed) {
            emit({ type: "error", message: "请求过于频繁，请稍后再试。", code: "rate_limited" });
            emit({ type: "phase", phase: "done" });
            return;
          }

          if (!query) {
            emit({ type: "error", message: "请输入校园问题。", code: "empty_query" });
            emit({ type: "phase", phase: "done" });
            return;
          }

          await runCampusAgent(query, { emit, signal: request.signal, requestId });
        } catch (error) {
          console.error(error);
          emit({ type: "error", message: "Agent 执行失败。", code: "agent_failed" });
          emit({ type: "phase", phase: "done" });
        } finally {
          if (!closed) {
            try {
              controller.enqueue(encoder.encode(encodeAgentDone()));
              controller.close();
            } catch {
              closed = true;
            }
          }
        }
      })().catch(() => {});
    },
    cancel() {
      closed = true;
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      "x-accel-buffering": "no",
      "x-agent-request-id": requestId,
    },
  });
}
