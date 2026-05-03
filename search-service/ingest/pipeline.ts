import { getSourceAdapter } from "./adapters.ts";
import { readIngestRuntimeConfig, resolveSelectedSources } from "./config.ts";
import { fetchHtml } from "./http.ts";
import { PostgresStore } from "./postgres-store.ts";
import type { ParsedArticle, SourceRunSummary, SupportedSourceId } from "./types.ts";
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

async function discoverDetailUrls(
  sourceId: SupportedSourceId,
  config: ReturnType<typeof readIngestRuntimeConfig>,
) {
  const source = resolveSelectedSources([sourceId])[0];
  const adapter = getSourceAdapter(sourceId);
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
      const html = await fetchHtml(pageUrl, config);
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
  sourceId: SupportedSourceId,
  config: ReturnType<typeof readIngestRuntimeConfig>,
  detailUrl: string,
): Promise<PreparedArticleResult> {
  const source = resolveSelectedSources([sourceId])[0];
  const adapter = getSourceAdapter(sourceId);
  let html = "";

  try {
    html = await fetchHtml(detailUrl, config);
    const parsed = adapter.parseDetailPage(detailUrl, html);
    const canonicalUrl = normalizeCanonicalUrl(detailUrl);
    const chunks = buildChunksFromMarkdown(parsed.cleanedMarkdown);

    if (chunks.length === 0) {
      throw new Error("No chunks generated from cleaned markdown.");
    }

    return {
      ok: true,
      article: {
        source,
        url: detailUrl,
        canonicalUrl,
        externalId: extractExternalIdFromUrl(canonicalUrl),
        title: parsed.title,
        publishedAt: parsed.publishedAt,
        updatedAt: parsed.updatedAt,
        fetchedAt: new Date().toISOString(),
        rawHtml: html,
        cleanedMarkdown: parsed.cleanedMarkdown,
        dedupKey: buildDedupKey(source.id, parsed.title, parsed.publishedAt),
        contentHash: buildContentHash(parsed.cleanedMarkdown),
        chunks,
      },
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

    const summaries: SourceRunSummary[] = [];

    for (const source of sources) {
      const runId = await store.createRun(source.id);
      const summary: SourceRunSummary = {
        sourceId: source.id,
        fetchedCount: 0,
        storedCount: 0,
        dedupedCount: 0,
        skippedCount: 0,
        chunkCount: 0,
        errorCount: 0,
        errors: [],
      };

      try {
        const discovery = await discoverDetailUrls(source.id, config);

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

        const preparedResults = await runWithConcurrency(discovery.detailUrls, config.concurrency, (detailUrl) =>
          prepareArticle(source.id, config, detailUrl)
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
