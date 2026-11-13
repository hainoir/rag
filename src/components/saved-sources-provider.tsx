"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";

import { loadSavedSources, removeSavedSource, saveSource, type SavedSource } from "@/lib/search/saved-sources";
import type { SearchSource } from "@/lib/search/types";

type SavedSourcesContextValue = {
  items: SavedSource[];
  hydrated: boolean;
  saveSource: (source: SearchSource) => boolean;
  removeSource: (preferredUrl: string) => boolean;
};

const SavedSourcesContext = createContext<SavedSourcesContextValue | null>(null);

function browserStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function SavedSourcesProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<SavedSource[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const itemsRef = useRef(items);

  useEffect(() => {
    const loaded = loadSavedSources(browserStorage());
    itemsRef.current = loaded;
    setItems(loaded);
    setHydrated(true);
  }, []);

  const update = (result: { ok: boolean; items: SavedSource[] }) => {
    if (result.ok) {
      itemsRef.current = result.items;
      setItems(result.items);
    }
    return result.ok;
  };

  return (
    <SavedSourcesContext.Provider
      value={{
        items,
        hydrated,
        saveSource: (source) => update(saveSource(browserStorage(), itemsRef.current, source)),
        removeSource: (preferredUrl) => update(removeSavedSource(browserStorage(), itemsRef.current, preferredUrl)),
      }}
    >
      {children}
    </SavedSourcesContext.Provider>
  );
}

export function useSavedSources() {
  const context = useContext(SavedSourcesContext);
  if (!context) throw new Error("useSavedSources must be used within SavedSourcesProvider");
  return context;
}
