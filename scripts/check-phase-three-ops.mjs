import fs from "node:fs/promises";
import path from "node:path";

import {
  evaluateOperationsSnapshot,
  readOperationsCheckConfig,
} from "../src/lib/search/operations-monitor.ts";

async function requestJson(url, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
      },
      cache: "no-store",
      signal: controller.signal,
    });

    if (!response.ok) {
      const contentType = response.headers.get("content-type") ?? "";
      let detail = response.statusText;

      try {
        if (contentType.includes("application/json")) {
          const payload = await response.clone().json();
          detail =
            payload?.message ??
            payload?.error ??
            payload?.errorCode ??
            JSON.stringify(payload).slice(0, 240);
        } else {
          detail = (await response.text()).trim().slice(0, 240) || response.statusText;
        }
      } catch {
        detail = response.statusText;
      }

      throw new Error(`${url} returned ${response.status}: ${detail}`);
    }

    return response.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function maybeWriteReport(report) {
  const outputPath = process.env.OPS_OUTPUT_PATH?.trim();

  if (!outputPath) {
    return;
  }

  const resolvedPath = path.resolve(process.cwd(), outputPath);
  await fs.mkdir(path.dirname(resolvedPath), { recursive: true });
  await fs.writeFile(resolvedPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

async function main() {
  const config = readOperationsCheckConfig();

  if (!config.healthUrl || !config.metricsUrl) {
    throw new Error(
      "SEARCH_SERVICE_URL or both SEARCH_SERVICE_HEALTH_URL and SEARCH_SERVICE_METRICS_URL must be configured.",
    );
  }

  const [health, metrics] = await Promise.all([
    requestJson(config.healthUrl, config.requestTimeoutMs),
    requestJson(config.metricsUrl, config.requestTimeoutMs),
  ]);
  const evaluation = evaluateOperationsSnapshot(health, metrics, config);
  const report = {
    checkedAt: new Date().toISOString(),
    endpoints: {
      healthUrl: config.healthUrl,
      metricsUrl: config.metricsUrl,
    },
    config: {
      allowDegraded: config.allowDegraded,
      requirePersistent: config.requirePersistent,
      maxErrorRate: config.maxErrorRate,
      maxAverageDurationMs: config.maxAverageDurationMs,
      maxUpstreamTimeouts: config.maxUpstreamTimeouts,
      maxRecentIngestionFailures: config.maxRecentIngestionFailures,
    },
    ...evaluation,
  };

  await maybeWriteReport(report);
  console.log(JSON.stringify(report, null, 2));

  if (!evaluation.ok) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
