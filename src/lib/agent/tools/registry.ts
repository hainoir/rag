import type { SearchProvider } from "../../search/types.ts";
import type { NoticeDocument, SearchAnswerEvidence, SearchSource } from "../../search/types.ts";
import { exportCitations } from "./export-citations.ts";
import { fetchNoticeTool } from "./fetch-notice.ts";
import { searchNotices } from "./search-notices.ts";

type ToolRegistry = {
  search_notices: {
    description: string;
    run: (
      args: { query: string },
      deps?: { search?: SearchProvider["search"]; requestId?: string },
    ) => ReturnType<typeof searchNotices>;
  };
  fetch_notice: {
    description: string;
    run: (args: { documentId: string }, deps?: { fetchNotice?: SearchProvider["fetchNotice"]; requestId?: string }) => ReturnType<typeof fetchNoticeTool>;
  };
  export_citations: {
    description: string;
    run: (args: { sources: SearchSource[]; evidence?: SearchAnswerEvidence[]; documents?: NoticeDocument[] }) => ReturnType<typeof exportCitations>;
  };
};

export const toolRegistry: ToolRegistry = {
  search_notices: {
    description: "Search campus notices and return an answer with sources.",
    run: ({ query }, deps) => searchNotices(query, deps?.search, deps?.requestId),
  },
  fetch_notice: {
    description: "Read one notice body by its document ID.",
    run: ({ documentId }, deps) => fetchNoticeTool(documentId, deps?.fetchNotice, deps?.requestId),
  },
  export_citations: {
    description: "Format retrieved sources as copyable citations.",
    run: ({ sources, evidence, documents }) => exportCitations(sources, evidence, documents),
  },
};
