import { getSourceAdapter } from "./adapters.ts";
import { readIngestRuntimeConfig, resolveSelectedSources } from "./config.ts";
import { fetchHtml } from "./http.ts";
import { moderateCommunityMarkdown } from "./moderation.ts";
import { PostgresStore } from "./postgres-store.ts";
import type { ParsedArticle, SelectedSource, SourceRunSummary } from "./types.ts";
import {
  buildChunksFromMarkdown,
  buildContentHash,
  buildDedupKey,
  extractExternalIdFromUrl,
  normalizeCanonicalUrl,
  runWithConcurrency,
} from "./utils.ts";

type PreparedArticleResult =
  | {
      ok: true;
      article: ParsedArticle;
    }
  | {
      ok: false;
      skipped: true;
      reason: string;
    }
  | {
      ok: false;
      skipped?: false;
      error: string;
    };

function summarizeErrors(errors: string[]) {
  if (errors.length === 0) {
    return null;
  }

  return errors.join("\n").slice(0, 4_000);
}

function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function buildModerationBlockedError(detailUrl: string, reason: string | undefined) {
  return new Error(`MODERATION_BLOCKED:${detailUrl}:${reason ?? "flagged"}`);
}

async function runWithRetry<T>(
  task: () => Promise<T>,
  config: ReturnType<typeof readIngestRuntimeConfig>,
  onRetry?: (attempt: number, error: unknown) => Promise<void> | void,
) {
  let attempt = 1;

  while (true) {
    try {
      return await task();
    } catch (error) {
      if (attempt >= config.retryAttempts) {
        throw error;
      }

      attempt += 1;
      await onRetry?.(attempt, error);
      await sleep(config.retryDelayMs * (attempt - 1));
    }
  }
}

export function sanitizeCommunityMarkdown(markdown: string) {
  return markdown
    .replace(/\b1[3-9]\d{9}\b/g, "[手机号已隐藏]")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[邮箱已隐藏]")
    .replace(/((?:微信|vx|QQ|qq)[:：\s]*)[A-Za-z0-9_-]{5,}/g, "$1[联系方式已隐藏]");
}

async function discoverDetailUrls(source: SelectedSource, config: ReturnType<typeof readIngestRuntimeConfig>) {
  const adapter = getSourceAdapter(source.id);
  const pending = [...adapter.seedListUrls(source)];
  const visited = new Set<string>();
  const detailUrls = new Set<string>();
  const errors: string[] = [];

  while (pending.length > 0 && detailUrls.size < config.fetchLimit) {
    const pageUrl = pending.shift();

    if (!pageUrl || visited.has(pageUrl)) {
      continue;
    }

    visited.add(pageUrl);

    try {
      const html = await runWithRetry(
        () => fetchHtml(pageUrl, config),
        config,
        (attempt, error) => {
          errors.push(
            `List page retry ${attempt} for ${pageUrl}: ${error instanceof Error ? error.message : String(error)}`,
          );
        },
      );
      const parsed = adapter.parseListPage(source, pageUrl, html);

      parsed.detailUrls.forEach((url) => {
        if (detailUrls.size < config.fetchLimit) {
          detailUrls.add(url);
        }
      });
      parsed.extraListUrls.forEach((url) => {
        if (!visited.has(url) && !pending.includes(url)) {
          pending.push(url);
        }
      });
    } catch (error) {
      errors.push(`List page failed for ${pageUrl}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return {
    source,
    adapter,
    detailUrls: [...detailUrls].sort(),
    errors,
  };
}

async function prepareArticle(
  source: SelectedSource,
  config: ReturnType<typeof readIngestRuntimeConfig>,
  detailUrl: string,
  onRetry?: (attempt: number, error: unknown) => Promise<void> | void,
): Promise<PreparedArticleResult> {
  const adapter = getSourceAdapter(source.id);
  let html = "";

  try {
    const article = await runWithRetry(
      async () => {
        html = await fetchHtml(detailUrl, config);
        const parsed = adapter.parseDetailPage(detailUrl, html);
        const canonicalUrl = normalizeCanonicalUrl(detailUrl);
        const cleanedMarkdown =
          source.cleaningProfile === "community_thread"
            ? sanitizeCommunityMarkdown(parsed.cleanedMarkdown)
            : parsed.cleanedMarkdown;
        const moderation =
          source.cleaningProfile === "community_thread"
            ? await moderateCommunityMarkdown(cleanedMarkdown, config)
            : { allowed: true, flagged: false };

        if (!moderation.allowed) {
          throw buildModerationBlockedError(detailUrl, moderation.reason);
        }

        if (moderation.flagged) {
          console.log(
            JSON.stringify({
              level: "info",
              timestamp: new Date().toISOString(),
              service: "ingestion",
              event: "community_content.flagged",
              sourceId: source.id,
              detailUrl,
              reason: moderation.reason ?? "flagged",
            }),
          );
        }

        const chunks = buildChunksFromMarkdown(cleanedMarkdown);

        if (chunks.length === 0) {
          throw new Error("No chunks generated from cleaned markdown.");
        }

        return {
          source,
          url: detailUrl,
          canonicalUrl,
          externalId: extractExternalIdFromUrl(canonicalUrl),
          title: parsed.title,
          publishedAt: parsed.publishedAt,
          updatedAt: parsed.updatedAt,
          fetchedAt: new Date().toISOString(),
          rawHtml: html,
          cleanedMarkdown,
          dedupKey: buildDedupKey(source.id, parsed.title, parsed.publishedAt),
          contentHash: buildContentHash(cleanedMarkdown),
          chunks,
          moderationFlagged: moderation.flagged,
          moderationReason: moderation.reason,
        };
      },
      config,
      onRetry,
    );

    return {
      ok: true,
      article,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (message.includes("No article content extracted") && html.includes("NewsvoteDWR.getNewsLinkUrl")) {
      return {
        ok: false,
        skipped: true,
        reason: `Skipped redirect-only article shell for ${detailUrl}`,
      };
    }

    if (message.startsWith("MODERATION_BLOCKED:")) {
      return {
        ok: false,
        skipped: true,
        reason: `Community content blocked by moderation for ${detailUrl}: ${message.split(":").slice(2).join(":")}`,
      };
    }

    return {
      ok: false,
      error: `Detail page failed for ${detailUrl}: ${message}`,
    };
  }
}

export async function runIngestionPipeline(sourceIds: string[]) {
  const config = readIngestRuntimeConfig();
  const sources = resolveSelectedSources(sourceIds);
  const store = new PostgresStore(config.databaseUrl);

  try {
    await store.initSchema();
    await store.upsertSources(sources);
    const effectiveSources = await store.applySourceGovernanceOverrides(sources);

    const summaries: SourceRunSummary[] = [];

    for (const source of effectiveSources) {
      const runId = await store.createRun(source.id);
      const summary: SourceRunSummary = {
        sourceId: source.id,
        fetchedCount: 0,
        storedCount: 0,
        dedupedCount: 0,
        skippedCount: 0,
        staleCount: 0,
        chunkCount: 0,
        errorCount: 0,
        errors: [],
      };

      try {
        const discovery = await discoverDetailUrls(source, config);

        summary.fetchedCount = discovery.detailUrls.length;
        summary.errors.push(...discovery.errors);
        summary.errorCount += discovery.errors.length;

        if (summary.fetchedCount === 0) {
          summary.errors.push(`No detail URLs discovered for ${source.id}.`);
          summary.errorCount += 1;
        }

        await store.updateRun(runId, {
          stage: "clean",
          fetchedCount: summary.fetchedCount,
          errorMessage: summarizeErrors(summary.errors),
        });

        const preparedResults = await runWithConcurrency(discovery.detailUrls, config.concurrency, async (detailUrl) =>
          prepareArticle(source, config, detailUrl, async (attempt, error) => {
            await store.recordRunItem({
              runId,
              sourceId: source.id,
              stage: "clean",
              itemUrl: detailUrl,
              status: "retried",
              attempt,
              errorMessage: error instanceof Error ? error.message : String(error),
            });
          }).then(async (result) => {
            await store.recordRunItem({
              runId,
              sourceId: source.id,
              stage: "clean",
              itemUrl: detailUrl,
              status: result.ok ? "succeeded" : result.skipped ? "skipped" : "failed",
              errorMessage: result.ok ? null : result.skipped ? result.reason : result.error,
            });

            return result;
          }),
        );

        await store.updateRun(runId, {
          stage: "dedup",
          fetchedCount: summary.fetchedCount,
          errorMessage: summarizeErrors(summary.errors),
        });

        for (const result of preparedResults) {
          if (!result.ok) {
            if (result.skipped) {
              summary.skippedCount += 1;
              continue;
            }

            summary.errorCount += 1;
            summary.errors.push(result.error);
            continue;
          }

          const outcome = await store.persistArticle(result.article);

          if (outcome.kind === "stored") {
            summary.storedCount += 1;
            summary.chunkCount += outcome.chunkCount;
          } else {
            summary.dedupedCount += 1;
          }

          if (result.article.source.type === "community" && outcome.documentId) {
            await store.recordCommunityReviewCandidate({
              sourceId: result.article.source.id,
              documentId: outcome.documentId,
              canonicalUrl: result.article.canonicalUrl,
              title: result.article.title,
              moderationFlagged: result.article.moderationFlagged,
              moderationReason: result.article.moderationReason,
            });
          }
        }

        if (summary.fetchedCount > 0) {
          const activeCanonicalUrls = preparedResults
            .filter((result): result is Extract<PreparedArticleResult, { ok: true }> => result.ok)
            .map((result) => result.article.canonicalUrl);

          summary.staleCount = await store.markSourceDocumentsStale(source.id, activeCanonicalUrls);
        }

        const status =
          summary.errorCount === 0
            ? "succeeded"
            : summary.storedCount > 0 || summary.dedupedCount > 0
              ? "partial"
              : "failed";

        await store.updateRun(runId, {
          stage: "index",
          storedCount: summary.storedCount,
          dedupedCount: summary.dedupedCount,
          chunkCount: summary.chunkCount,
          errorMessage: summarizeErrors(summary.errors),
        });
        await store.updateRun(runId, {
          stage: "publish",
          status,
          storedCount: summary.storedCount,
          dedupedCount: summary.dedupedCount,
          chunkCount: summary.chunkCount,
          endedAt: new Date().toISOString(),
          errorMessage: summarizeErrors(summary.errors),
        });

        summaries.push(summary);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);

        summary.errorCount += 1;
        summary.errors.push(message);

        await store.updateRun(runId, {
          stage: "publish",
          status: "failed",
          fetchedCount: summary.fetchedCount,
          storedCount: summary.storedCount,
          dedupedCount: summary.dedupedCount,
          chunkCount: summary.chunkCount,
          endedAt: new Date().toISOString(),
          errorMessage: summarizeErrors(summary.errors),
        });

        summaries.push(summary);
      }
    }

    return summaries;
  } finally {
    await store.close();
  }
}
