"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

const STORAGE_KEY = "campus-rag-history";
const HISTORY_LIMIT = 6;

type SearchHistoryContextValue = {
  history: string[];
  hydrated: boolean;
  addQuery: (query: string) => void;
  clearHistory: () => void;
};

const SearchHistoryContext = createContext<SearchHistoryContextValue | null>(null);

export function SearchHistoryProvider({ children }: { children: ReactNode }) {
  const [history, setHistory] = useState<string[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);

      if (stored) {
        setHistory(JSON.parse(stored) as string[]);
      }
    } catch {
      setHistory([]);
    } finally {
      setHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!hydrated) {
      return;
    }

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
  }, [history, hydrated]);

  const addQuery = (query: string) => {
    const trimmed = query.trim();

    if (!trimmed) {
      return;
    }

    setHistory((current) =>
      [trimmed, ...current.filter((item) => item !== trimmed)].slice(0, HISTORY_LIMIT),
    );
  };

  const clearHistory = () => {
    setHistory([]);
  };

  return (
    <SearchHistoryContext.Provider
      value={{
        history,
        hydrated,
        addQuery,
        clearHistory,
      }}
    >
      {children}
    </SearchHistoryContext.Provider>
  );
}

export function useSearchHistory() {
  const context = useContext(SearchHistoryContext);

  if (!context) {
    throw new Error("useSearchHistory must be used within SearchHistoryProvider");
  }

  return context;
}

