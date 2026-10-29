import type { SearchProvider } from "../../search/types.ts";
import type { SearchAnswerEvidence, SearchSource } from "../../search/types.ts";
import { exportCitations } from "./export-citations.ts";
import { searchNotices } from "./search-notices.ts";

type ToolRegistry = {
  search_notices: {
    description: string;
    run: (
      args: { query: string },
      deps?: { search?: SearchProvider["search"]; requestId?: string },
    ) => ReturnType<typeof searchNotices>;
  };
  export_citations: {
    description: string;
    run: (args: { sources: SearchSource[]; evidence?: SearchAnswerEvidence[] }) => ReturnType<typeof exportCitations>;
  };
};

export const toolRegistry: ToolRegistry = {
  search_notices: {
    description: "Search campus notices and return an answer with sources.",
    run: ({ query }, deps) => searchNotices(query, deps?.search, deps?.requestId),
  },
  export_citations: {
    description: "Format retrieved sources as copyable citations.",
    run: ({ sources, evidence }) => exportCitations(sources, evidence),
  },
};
