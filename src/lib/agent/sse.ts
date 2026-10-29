import type { AgentEvent } from "./types.ts";

export function encodeAgentEvent(event: AgentEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

export function encodeAgentDone(): string {
  return "data: [DONE]\n\n";
}
