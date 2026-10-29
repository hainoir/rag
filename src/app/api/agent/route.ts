import { runCampusAgent } from "@/lib/agent/orchestrator";
import { encodeAgentDone, encodeAgentEvent } from "@/lib/agent/sse";
import type { AgentEvent } from "@/lib/agent/types";
import { createSearchRequestId } from "@/lib/search/response-meta";

export const runtime = "nodejs";

export function GET(request: Request) {
  const requestId = createSearchRequestId();
  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const emit = (event: AgentEvent) => controller.enqueue(encoder.encode(encodeAgentEvent(event)));

      void (async () => {
        try {
          if (!query) {
            emit({ type: "error", message: "请输入校园问题。", code: "empty_query" });
            emit({ type: "phase", phase: "done" });
            return;
          }

          await runCampusAgent(query, { emit });
        } catch (error) {
          emit({ type: "error", message: error instanceof Error ? error.message : "Agent 执行失败。", code: "agent_failed" });
          emit({ type: "phase", phase: "done" });
        } finally {
          controller.enqueue(encoder.encode(encodeAgentDone()));
          controller.close();
        }
      })();
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-agent-request-id": requestId,
    },
  });
}
