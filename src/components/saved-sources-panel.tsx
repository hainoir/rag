"use client";

import { useState } from "react";

import { useSavedSources } from "@/components/saved-sources-provider";

export function SavedSourcesPanel() {
  const { items, hydrated, removeSource } = useSavedSources();
  const [failed, setFailed] = useState(false);

  return (
    <section aria-label="已收藏来源" className="surface rounded-[var(--radius-lg)] p-5">
      <h2 className="text-sm font-semibold tracking-[0.18em] text-[var(--official)] uppercase">已收藏来源</h2>
      <p className="mt-1 text-sm muted">仅保存来源链接；打开后请以原网页内容为准。</p>
      {failed ? (
        <p role="alert" className="mt-3 text-sm text-red-700">
          移除失败，请检查浏览器本地存储后重试。
        </p>
      ) : null}

      {!hydrated ? (
        <div aria-label="正在加载已收藏来源" className="mt-4 h-12 animate-pulse rounded-2xl bg-white/60" />
      ) : items.length ? (
        <ul className="mt-4 space-y-3">
          {items.map((item) => (
            <li className="rounded-2xl border border-[var(--line)] bg-white/70 px-4 py-3" key={item.preferredUrl}>
              <p className="font-medium">{item.title}</p>
              <p className="mt-1 text-sm muted">{item.sourceName}</p>
              <div className="mt-3 flex flex-wrap gap-4 text-sm">
                <a
                  className="text-[var(--official)] underline"
                  href={item.preferredUrl}
                  rel="noreferrer"
                  target="_blank"
                  aria-label={`打开来源：${item.title}`}
                >
                  打开来源
                </a>
                <button
                  className="text-[var(--muted)] hover:text-[var(--official)]"
                  type="button"
                  aria-label={`取消收藏：${item.title}`}
                  onClick={() => setFailed(!removeSource(item.preferredUrl))}
                >
                  取消收藏
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p
          role="status"
          className="mt-4 rounded-2xl border border-dashed border-[var(--line)] bg-white/50 px-4 py-6 text-sm muted"
        >
          还没有收藏来源。检索后可在来源卡片中收藏，稍后从这里打开。
        </p>
      )}
    </section>
  );
}
