import "server-only";

import type { SearchFeedbackPayload } from "@/lib/search/feedback";

import { postSearchServiceJson, readSearchServiceProxyConfig } from "./search-service-proxy";

export async function storeSearchFeedback(feedback: SearchFeedbackPayload) {
  const { feedbackTimeoutMs } = readSearchServiceProxyConfig();

  await postSearchServiceJson("/api/feedback", feedback, feedbackTimeoutMs);

  return {
    stored: true,
  };
}
