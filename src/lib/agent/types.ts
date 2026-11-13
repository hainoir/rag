export type AgentPhase = "received" | "retrieving" | "tool" | "answering" | "done" | "error" | "fallback";

export type ToolName = "search_notices" | "fetch_notice" | "export_citations";

export type AgentCitation = {
  sourceId: string;
  documentId?: string;
  title: string;
  sourceName: string;
  url?: string;
  snippet?: string;
};

export type AgentEvent =
  | { type: "phase"; phase: AgentPhase; detail?: string }
  | { type: "tool_call"; id: string; name: ToolName; args: Record<string, unknown> }
  | { type: "tool_result"; id: string; name: ToolName; ok: boolean; summary: string }
  | { type: "answer"; summary: string; citations: AgentCitation[]; evidence?: { sourceId: string; title: string; sourceName: string; snippet: string }[]; fallback?: boolean }
  | { type: "error"; message: string; code?: string };
