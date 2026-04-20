import type { SourceFreshness } from "@/lib/search/types";

export function cn(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function parseDate(value?: string) {
  if (!value) {
    return null;
  }

  const normalized = new Date(value);
  return Number.isNaN(normalized.getTime()) ? null : normalized;
}

export function formatSourceDate(value?: string) {
  const normalized = parseDate(value);

  if (!normalized) {
    return "时间未标注";
  }

  return new Intl.DateTimeFormat("zh-HK", {
    month: "numeric",
    day: "numeric",
  }).format(normalized);
}

export function formatResultGeneratedAt(value: string) {
  const normalized = parseDate(value);

  if (!normalized) {
    return "时间未知";
  }

  return new Intl.DateTimeFormat("zh-HK", {
    hour: "2-digit",
    minute: "2-digit",
    month: "numeric",
    day: "numeric",
  }).format(normalized);
}

export function formatDateTime(value?: string) {
  const normalized = parseDate(value);

  if (!normalized) {
    return "时间未标注";
  }

  return new Intl.DateTimeFormat("zh-HK", {
    hour: "2-digit",
    minute: "2-digit",
    month: "numeric",
    day: "numeric",
  }).format(normalized);
}

export function formatFreshnessLabel(value?: SourceFreshness) {
  switch (value) {
    case "fresh":
      return "最近已更新";
    case "recent":
      return "近期来源";
    case "stale":
      return "需要复核";
    case "undated":
      return "时间待补";
    default:
      return null;
  }
}

export function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
