const ALLOWED_SEARCH_STATUSES = new Set(["ok", "partial", "empty", "error"]);
const ALLOWED_CACHE_STATUSES = new Set(["hit", "miss", "bypass"]);
const ALLOWED_GATEWAY_EVENTS = new Set(["search_response", "rate_limited", "gateway_error"]);

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function toNonNegativeInteger(value) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return null;
  }

  return Math.round(value);
}

function parseSearchFeedbackPayload(value) {
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
  const sourceIds = Array.isArray(value.sourceIds)
    ? value.sourceIds
        .filter((item) => isNonEmptyString(item))
        .map((item) => item.trim())
        .slice(0, 10)
    : undefined;

  return {
    ok: true,
    feedback: {
      requestId,
      query,
      rating,
      ...(reason ? { reason } : {}),
      ...(sourceIds && sourceIds.length > 0 ? { sourceIds } : {}),
    },
  };
}

function parseSearchQueryLogPayload(value) {
  if (!isRecord(value)) {
    return {
      ok: false,
      error: "Payload must be an object.",
    };
  }

  const requestId = isNonEmptyString(value.requestId) ? value.requestId.trim() : "";
  const query = isNonEmptyString(value.query) ? value.query.trim() : "";
  const status = isNonEmptyString(value.status) ? value.status.trim().toLowerCase() : "";
  const cacheStatus = isNonEmptyString(value.cacheStatus) ? value.cacheStatus.trim().toLowerCase() : "";
  const gatewayEvent = isNonEmptyString(value.gatewayEvent) ? value.gatewayEvent.trim().toLowerCase() : "";
  const retrievedCount = toNonNegativeInteger(value.retrievedCount);
  const sourceCount = toNonNegativeInteger(value.sourceCount);
  const officialSourceCount = toNonNegativeInteger(value.officialSourceCount);
  const communitySourceCount = toNonNegativeInteger(value.communitySourceCount);

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

  if (!ALLOWED_SEARCH_STATUSES.has(status)) {
    return {
      ok: false,
      error: "status must be one of ok, partial, empty, error.",
    };
  }

  if (!ALLOWED_CACHE_STATUSES.has(cacheStatus)) {
    return {
      ok: false,
      error: "cacheStatus must be one of hit, miss, bypass.",
    };
  }

  if (!ALLOWED_GATEWAY_EVENTS.has(gatewayEvent)) {
    return {
      ok: false,
      error: "gatewayEvent must be one of search_response, rate_limited, gateway_error.",
    };
  }

  if (
    retrievedCount === null ||
    sourceCount === null ||
    officialSourceCount === null ||
    communitySourceCount === null
  ) {
    return {
      ok: false,
      error: "retrievedCount, sourceCount, officialSourceCount, and communitySourceCount must be integers >= 0.",
    };
  }

  if (officialSourceCount + communitySourceCount > sourceCount) {
    return {
      ok: false,
      error: "officialSourceCount and communitySourceCount cannot exceed sourceCount.",
    };
  }

  const errorCode = isNonEmptyString(value.errorCode) ? value.errorCode.trim() : undefined;
  const durationMs = value.durationMs === undefined ? undefined : toNonNegativeInteger(value.durationMs);

  if (value.durationMs !== undefined && durationMs === null) {
    return {
      ok: false,
      error: "durationMs must be an integer >= 0 when provided.",
    };
  }

  const clientId = isNonEmptyString(value.clientId) ? value.clientId.trim() : undefined;

  return {
    ok: true,
    payload: {
      requestId,
      query,
      status,
      retrievedCount,
      sourceCount,
      officialSourceCount,
      communitySourceCount,
      cacheStatus,
      ...(errorCode ? { errorCode } : {}),
      ...(durationMs !== undefined ? { durationMs } : {}),
      ...(clientId ? { clientId } : {}),
      gatewayEvent,
    },
  };
}

module.exports = {
  parseSearchFeedbackPayload,
  parseSearchQueryLogPayload,
};
