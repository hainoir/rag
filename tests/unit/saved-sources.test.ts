import { describe, expect, test, vi } from "vitest";

import {
  loadSavedSources,
  removeSavedSource,
  saveSource,
  SAVED_SOURCES_STORAGE_KEY,
  toSavedSource,
} from "@/lib/search/saved-sources";
import type { SearchSource } from "@/lib/search/types";

const source = {
  title: "图书馆借阅规则",
  sourceName: "图书馆",
  url: "https://example.edu/raw",
  canonicalUrl: "https://example.edu/canonical",
} as SearchSource;

describe("saved sources storage", () => {
  test("saves the preferred canonical URL and removes it", () => {
    const saved = saveSource(window.localStorage, [], source);
    expect(saved).toEqual({
      ok: true,
      items: [{ preferredUrl: source.canonicalUrl, title: source.title, sourceName: source.sourceName }],
    });
    expect(loadSavedSources(window.localStorage)).toEqual(saved.items);
    expect(removeSavedSource(window.localStorage, saved.items, source.canonicalUrl!)).toEqual({ ok: true, items: [] });
    expect(loadSavedSources(window.localStorage)).toEqual([]);
  });

  test("deduplicates by preferred URL, including a canonical URL colliding with another original URL", () => {
    const first = saveSource(window.localStorage, [], source);
    const duplicate = saveSource(window.localStorage, first.items, { ...source, title: "更新标题" });
    expect(duplicate.items).toHaveLength(1);
    expect(duplicate.items[0].title).toBe("更新标题");

    const collision = saveSource(window.localStorage, duplicate.items, {
      ...source,
      url: source.canonicalUrl,
      canonicalUrl: undefined,
      title: "原始链接重合",
    });
    expect(collision.items).toHaveLength(1);
    expect(collision.items[0].title).toBe("原始链接重合");
  });

  test("rejects invalid source URLs and drops invalid stored records", () => {
    expect(toSavedSource({ ...source, url: "javascript:alert(1)", canonicalUrl: "not a URL" })).toBeNull();
    expect(toSavedSource({ ...source, canonicalUrl: "mailto:a@example.edu" })?.preferredUrl).toBe(source.url);
    expect(
      saveSource(window.localStorage, [], { ...source, url: "ftp://example.edu", canonicalUrl: undefined }).ok,
    ).toBe(false);

    window.localStorage.setItem(
      SAVED_SOURCES_STORAGE_KEY,
      JSON.stringify([
        { preferredUrl: "javascript:alert(1)", title: "bad", sourceName: "bad" },
        { preferredUrl: "https://example.edu/valid", title: "Valid", sourceName: "Library", snippet: "discard me" },
        { preferredUrl: "https://example.edu/valid", title: "Duplicate", sourceName: "Library" },
        { preferredUrl: "https://example.edu/no-title", title: "", sourceName: "Library" },
      ]),
    );
    expect(loadSavedSources(window.localStorage)).toEqual([
      { preferredUrl: "https://example.edu/valid", title: "Valid", sourceName: "Library" },
    ]);
  });

  test("failed writes never report a successful save or removal", () => {
    const setItem = vi.fn(() => {
      throw new Error("quota exceeded");
    });
    const failingStorage = { setItem };
    const failedSave = saveSource(failingStorage, [], source);
    expect(failedSave).toEqual({ ok: false, items: [] });
    const item = toSavedSource(source)!;
    expect(removeSavedSource(failingStorage, [item], item.preferredUrl)).toEqual({ ok: false, items: [item] });
    expect(removeSavedSource(failingStorage, [item], "https://example.edu/absent")).toEqual({
      ok: true,
      items: [item],
    });
    expect(setItem).toHaveBeenCalledTimes(2);
    expect(saveSource(null, [], source).ok).toBe(false);
  });
});
