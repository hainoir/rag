export type SearchFeedbackRating = "up" | "down";

export type SearchFeedbackPayload = {
  requestId: string;
  query: string;
  rating: SearchFeedbackRating;
  reason?: string;
  sourceIds?: string[];
};

type ParseFeedbackResult =
  | {
      ok: true;
      feedback: SearchFeedbackPayload;
    }
  | {
      ok: false;
      error: string;
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizeSourceIds(value: unknown) {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const sourceIds = value
    .filter((item): item is string => isNonEmptyString(item))
    .map((item) => item.trim())
    .slice(0, 10);

  return sourceIds.length > 0 ? sourceIds : undefined;
}

export function parseSearchFeedbackPayload(value: unknown): ParseFeedbackResult {
  if (!isRecord(value)) {
    return {
      ok: false,
      error: "Payload must be an object.",
    };
  }

  const requestId = isNonEmptyString(value.requestId) ? value.requestId.trim() : "";
  const query = isNonEmptyString(value.query) ? value.query.trim() : "";
  const rating = value.rating;

  if (!requestId) {
    return {
      ok: false,
      error: "requestId is required.",
    };
  }

  if (!query) {
    return {
      ok: false,
      error: "query is required.",
    };
  }

  if (rating !== "up" && rating !== "down") {
    return {
      ok: false,
      error: 'rating must be "up" or "down".',
    };
  }

  const reason = isNonEmptyString(value.reason) ? value.reason.trim().slice(0, 500) : undefined;
  const sourceIds = normalizeSourceIds(value.sourceIds);

  return {
    ok: true,
    feedback: {
      requestId,
      query,
      rating,
      ...(reason ? { reason } : {}),
      ...(sourceIds ? { sourceIds } : {}),
    },
  };
}
