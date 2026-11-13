import type { SearchSource } from "@/lib/search/types";

export const SAVED_SOURCES_STORAGE_KEY = "campus-rag-saved-sources";

export type SavedSource = {
  preferredUrl: string;
  title: string;
  sourceName: string;
};

export type SaveResult = { ok: boolean; items: SavedSource[] };

function validHttpUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;

  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? value : null;
  } catch {
    return null;
  }
}

export function toSavedSource(
  source: Pick<SearchSource, "url" | "canonicalUrl" | "title" | "sourceName">,
): SavedSource | null {
  const preferredUrl = validHttpUrl(source.canonicalUrl) ?? validHttpUrl(source.url);
  if (!preferredUrl || !source.title.trim() || !source.sourceName.trim()) return null;

  return { preferredUrl, title: source.title, sourceName: source.sourceName };
}

export function loadSavedSources(storage: Pick<Storage, "getItem"> | null): SavedSource[] {
  if (!storage) return [];

  try {
    const raw = storage.getItem(SAVED_SOURCES_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    const seen = new Set<string>();
    const items: SavedSource[] = [];
    for (const entry of parsed) {
      if (typeof entry !== "object" || entry === null) continue;
      const record = entry as Record<string, unknown>;
      const preferredUrl = validHttpUrl(record.preferredUrl);
      if (
        !preferredUrl ||
        typeof record.title !== "string" ||
        !record.title.trim() ||
        typeof record.sourceName !== "string" ||
        !record.sourceName.trim() ||
        seen.has(preferredUrl)
      )
        continue;

      seen.add(preferredUrl);
      items.push({ preferredUrl, title: record.title, sourceName: record.sourceName });
    }
    return items;
  } catch {
    return [];
  }
}

function writeSavedSources(
  storage: Pick<Storage, "setItem"> | null,
  current: SavedSource[],
  items: SavedSource[],
): SaveResult {
  if (!storage) return { ok: false, items: current };
  try {
    storage.setItem(SAVED_SOURCES_STORAGE_KEY, JSON.stringify(items));
    return { ok: true, items };
  } catch {
    return { ok: false, items: current };
  }
}

export function saveSource(
  storage: Pick<Storage, "setItem"> | null,
  current: SavedSource[],
  source: SearchSource,
): SaveResult {
  const item = toSavedSource(source);
  if (!item) return { ok: false, items: current };

  const items = [item, ...current.filter((saved) => saved.preferredUrl !== item.preferredUrl)];
  return writeSavedSources(storage, current, items);
}

export function removeSavedSource(
  storage: Pick<Storage, "setItem"> | null,
  current: SavedSource[],
  preferredUrl: string,
): SaveResult {
  const items = current.filter((item) => item.preferredUrl !== preferredUrl);
  if (items.length === current.length) return { ok: true, items: current };
  return writeSavedSources(storage, current, items);
}
