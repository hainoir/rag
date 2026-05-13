import fs from "node:fs/promises";
import path from "node:path";

import {
  buildOperationsAlertPayload,
  readOperationsAlertConfig,
  shouldSendOperationsAlert,
} from "../src/lib/search/operations-alert.ts";

async function readReport() {
  const reportPath = process.env.OPS_OUTPUT_PATH?.trim();

  if (!reportPath) {
    throw new Error("OPS_OUTPUT_PATH must be configured before notifying.");
  }

  const resolvedPath = path.resolve(process.cwd(), reportPath);
  const content = await fs.readFile(resolvedPath, "utf8");
  return JSON.parse(content);
}

async function postJson(url, payload, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!response.ok) {
      const detail = (await response.text()).trim().slice(0, 240) || response.statusText;
      throw new Error(`Notification endpoint returned ${response.status}: ${detail}`);
    }
  } finally {
    clearTimeout(timeout);
  }
}

async function main() {
  const config = readOperationsAlertConfig();

  if (!config.webhookUrl) {
    console.log("No OPS_ALERT_WEBHOOK_URL configured. Skipping ops alert notification.");
    return;
  }

  const report = await readReport();

  if (!shouldSendOperationsAlert(report, config)) {
    console.log(
      `Ops alert notification skipped because notifyOn=${config.notifyOn} and report.ok=${String(report.ok)}.`,
    );
    return;
  }

  const payload = buildOperationsAlertPayload(report, config.provider, config.source);
  await postJson(config.webhookUrl, payload, config.timeoutMs);
  console.log(
    `Ops alert notification delivered: provider=${config.provider} notifyOn=${config.notifyOn} ok=${String(report.ok)}.`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
