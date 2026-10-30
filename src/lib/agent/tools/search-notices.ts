import type { SearchProvider, SearchResponse } from "../../search/types.ts";

export type SearchNoticesResult = Pick<SearchResponse, "status" | "answer" | "sources"> & {
  errorCode?: string;
};

export async function searchNotices(
  query: string,
  search?: SearchProvider["search"],
  requestId?: string,
): Promise<SearchNoticesResult> {
  // Loading the provider only for real requests keeps this tool easy to test in Node.
  const runSearch = search ?? (await import("../../search/search-provider.ts")).searchServiceProvider.search;
  const response = await runSearch(query, { requestId });

  return {
    status: response.status,
    answer: response.answer,
    sources: response.sources,
    ...(response.meta?.errorCode ? { errorCode: response.meta.errorCode } : {}),
  };
}
