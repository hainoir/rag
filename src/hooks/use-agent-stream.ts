"use client";

import { useEffect, useState } from "react";

import type { AgentEvent } from "@/lib/agent/types";

export type AgentStreamError = "disconnect" | "parse" | "agent" | null;

export function useAgentStream({ query }: { query: string }) {
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [error, setError] = useState<AgentStreamError>(null);
  const [run, setRun] = useState(0);
  const [completed, setCompleted] = useState(false);

  useEffect(() => {
    setEvents([]);
    setError(null);
    setCompleted(false);
    if (!query.trim()) return;

    let finished = false;
    const source = new EventSource(`/api/agent?q=${encodeURIComponent(query)}`);
    source.onmessage = (message) => {
      if (message.data === "[DONE]") {
        finished = true;
        setCompleted(true);
        source.close();
        return;
      }

      try {
        const event = JSON.parse(message.data) as AgentEvent;
        setEvents((current) => [...current, event]);
        if (event.type === "error") setError("agent");
        if (event.type === "phase" && event.phase === "done") {
          finished = true;
          setCompleted(true);
          source.close();
        }
      } catch {
        setError("parse");
        source.close();
      }
    };
    source.onerror = () => {
      if (!finished) setError("disconnect");
      source.close();
    };

    return () => source.close();
  }, [query, run]);

  return { events, error, completed, retry: () => setRun((current) => current + 1) };
}
