import type { NoticeDocument } from "../search/types.ts";
import type { AgentProcedure, AgentProcedureItem } from "./types.ts";

type Bucket = "steps" | "exceptions" | "verify";

const truncationMark = "…[已截断]";
const listMarker = /^(?:\d+[.、．]|[（(]\d+[）)]|[一二三四五六七八九十]+、|[-*•·])\s*(.+)$/u;
const sectionMarker = /^(?:[一二三四五六七八九十]+、|\d+[.、．]\s*)?(?:办理步骤|步骤|材料|特殊情况|注意事项|例外|仍需核对原文)\s*[:：]?$/u;

function section(line: string): Bucket | undefined {
  const heading = line.replace(/^#{1,6}\s*/, "").trim();
  if (!sectionMarker.test(heading)) return undefined;
  if (/^(?:材料|特殊情况|注意事项|例外)/u.test(heading.replace(/^(?:[一二三四五六七八九十]+、|\d+[.、．]\s*)/u, ""))) return "exceptions";
  return heading.includes("仍需核对原文") ? "verify" : "steps";
}

export function extractProcedure({ documents }: { documents: NoticeDocument[] }): AgentProcedure | undefined {
  const steps: AgentProcedureItem[] = [];
  const exceptions: AgentProcedureItem[] = [];
  const verify: AgentProcedureItem[] = [];

  for (const document of documents) {
    if (!document.answerEligible || document.type !== "official" ||
      (document.governanceStatus && document.governanceStatus !== "approved")) continue;

    const evidence = { documentId: document.documentId, title: document.title };
    let bucket: Bucket = "steps";
    let used = false;
    for (const rawLine of document.body.split(/\r?\n/u)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("演示语料（")) continue;
      const headingBucket = section(line);
      if (headingBucket) {
        bucket = headingBucket;
        continue;
      }
      if (line.startsWith("#")) continue;
      const match = listMarker.exec(line);
      if (!match || line.includes(truncationMark)) continue;
      const item = match[1].replace(/\s+/gu, " ").trim();
      if (!item) continue;
      ({ steps, exceptions, verify })[bucket].push({ text: item, evidence });
      used = true;
    }
    if (used && (document.truncated || document.body.endsWith(truncationMark))) {
      verify.push({ text: "正文已截断，请核对原文中的后续内容。", evidence });
    }
  }

  return steps.length ? { steps: steps as AgentProcedure["steps"], exceptions, verify } : undefined;
}
