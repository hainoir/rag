import type { IngestRuntimeConfig } from "./config.ts";

export type ModerationResult = {
  allowed: boolean;
  flagged: boolean;
  reason?: string;
};

function parsePositiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(String(value ?? ""), 10);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}

function buildModerationUrl(baseUrl: string) {
  const normalized = baseUrl.replace(/\/+$/, "");

  return normalized.endsWith("/moderations") ? normalized : `${normalized}/moderations`;
}

function extractModerationDecision(payload: unknown): ModerationResult {
  if (!payload || typeof payload !== "object" || !("results" in payload) || !Array.isArray(payload.results)) {
    throw new Error("Moderation response is missing results.");
  }

  const first = payload.results[0] as { flagged?: unknown; categories?: Record<string, unknown> } | undefined;
  const flagged = first?.flagged === true;
  const categories = first?.categories ?? {};
  const flaggedCategories = Object.entries(categories)
    .filter(([, value]) => value === true)
    .map(([key]) => key);

  return {
    allowed: !flagged,
    flagged,
    reason: flaggedCategories.length > 0 ? flaggedCategories.join(",") : flagged ? "flagged" : undefined,
  };
}

export async function moderateCommunityMarkdown(
  markdown: string,
  config: Pick<
    IngestRuntimeConfig,
    "moderationMode" | "moderationApiKey" | "moderationBaseUrl" | "moderationModel" | "moderationTimeoutMs"
  >,
): Promise<ModerationResult> {
  if (config.moderationMode === "off" || !config.moderationApiKey) {
    return {
      allowed: true,
      flagged: false,
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), parsePositiveInteger(String(config.moderationTimeoutMs), 8_000));

  try {
    const response = await fetch(buildModerationUrl(config.moderationBaseUrl), {
      method: "POST",
      headers: {
        authorization: `Bearer ${config.moderationApiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: config.moderationModel,
        input: markdown.slice(0, 12_000),
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Moderation API returned HTTP ${response.status}.`);
    }

    const decision = extractModerationDecision(await response.json());

    return config.moderationMode === "report"
      ? {
          ...decision,
          allowed: true,
        }
      : decision;
  } catch (error) {
    if (config.moderationMode === "enforce") {
      return {
        allowed: false,
        flagged: true,
        reason: error instanceof Error ? `moderation_error:${error.message}` : "moderation_error",
      };
    }

    return {
      allowed: true,
      flagged: false,
      reason: error instanceof Error ? `moderation_error:${error.message}` : "moderation_error",
    };
  } finally {
    clearTimeout(timeout);
  }
}
