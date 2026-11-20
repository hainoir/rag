import type { NoticeDocument } from "../search/types.ts";
import type { AgentProcedure, AgentProcedureItem } from "./types.ts";

type Bucket = "steps" | "materials" | "exceptions" | "verify";

const truncationMark = "…[已截断]";
const listMarker = /^(?:\d+[.、．]|[（(]\d+[）)]|[一二三四五六七八九十]+、|[-*•·])\s*(.+)$/u;
const sectionMarker = /^(?:[一二三四五六七八九十]+、|\d+[.、．]\s*)?(办理步骤|步骤|办理流程|操作步骤|材料|所需材料|申请材料|准备材料|提交材料|特殊情况|注意事项|例外|仍需核对原文)\s*[:：]?$/u;

function section(line: string): Bucket | undefined {
  const heading = line.replace(/^#{1,6}\s*/, "").trim();
  const name = sectionMarker.exec(heading)?.[1];
  if (!name) return undefined;
  if (name.includes("材料")) return "materials";
  if (name === "特殊情况" || name === "注意事项" || name === "例外") return "exceptions";
  return name === "仍需核对原文" ? "verify" : "steps";
}

function isTitle(rawLine: string, line: string): boolean {
  if (/^#{1,6}\s/u.test(line)) return true;
  if (rawLine !== rawLine.trimStart() || /[。！？.!?，,；;]$/u.test(line)) return false;
  return /^[\p{Script=Han}A-Za-z0-9（）()·/\s]{2,24}[:：]?$/u.test(line);
}

export function extractProcedure({ documents }: { documents: NoticeDocument[] }): AgentProcedure | undefined {
  const steps: AgentProcedureItem[] = [];
  const materials: AgentProcedureItem[] = [];
  const exceptions: AgentProcedureItem[] = [];
  const verify: AgentProcedureItem[] = [];
  const buckets = { steps, materials, exceptions, verify };

  for (const document of documents) {
    if (!document.answerEligible || document.type !== "official" ||
      (document.governanceStatus && document.governanceStatus !== "approved")) continue;

    const evidence = { documentId: document.documentId, title: document.title };
    let bucket: Bucket | undefined = "steps";
    let currentItem: AgentProcedureItem | undefined;
    let cutOff = false;
    for (const rawLine of document.body.split(/\r?\n/u)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("演示语料（")) {
        currentItem = undefined;
        continue;
      }
      const headingBucket = section(line);
      if (headingBucket) {
        bucket = headingBucket;
        currentItem = undefined;
        continue;
      }
      const match = listMarker.exec(line);
      if (isTitle(rawLine, line) && !match) {
        bucket = undefined;
        currentItem = undefined;
        continue;
      }
      if (line.includes(truncationMark)) {
        cutOff = true;
        currentItem = undefined;
        continue;
      }
      if (match) {
        currentItem = undefined;
        if (!bucket) continue;
        const item = match[1].replace(/\s+/gu, " ").trim();
        if (!item) continue;
        currentItem = { text: item, evidence };
        buckets[bucket].push(currentItem);
      } else if (currentItem) {
        currentItem.text += ` ${line.replace(/\s+/gu, " ")}`;
      }
    }
    if (cutOff || document.truncated || document.body.trimEnd().endsWith(truncationMark)) {
      verify.push({ text: "正文已截断，请核对原文中的后续内容。", evidence });
    }
  }

  return steps.length || materials.length || exceptions.length || verify.length
    ? { steps, materials, exceptions, verify }
    : undefined;
}
