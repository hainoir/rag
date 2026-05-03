import iconv from "iconv-lite";

import type { IngestRuntimeConfig } from "./config.ts";

function sniffEncoding(buffer: Buffer, contentType: string | null) {
  const headerCharset = contentType?.match(/charset=([^;]+)/i)?.[1]?.trim().toLowerCase();

  if (headerCharset) {
    return headerCharset;
  }

  const head = buffer.subarray(0, 2048).toString("ascii");
  const metaCharset = head.match(/<meta[^>]+charset=["']?([^"'>\s]+)/i)?.[1]?.trim().toLowerCase();

  if (metaCharset) {
    return metaCharset;
  }

  const httpEquivCharset = head.match(/content=["'][^"']*charset=([^"'>\s;]+)/i)?.[1]?.trim().toLowerCase();

  return httpEquivCharset ?? "utf-8";
}

function decodeBuffer(buffer: Buffer, encoding: string) {
  const normalized = encoding.replace(/^gb2312$/i, "gbk").replace(/^utf8$/i, "utf-8");

  if (normalized === "utf-8" || normalized === "utf8") {
    return buffer.toString("utf8");
  }

  if (iconv.encodingExists(normalized)) {
    return iconv.decode(buffer, normalized);
  }

  return buffer.toString("utf8");
}

export async function fetchHtml(url: string, config: IngestRuntimeConfig) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.httpTimeoutMs);

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": config.userAgent,
        Accept: "text/html,application/xhtml+xml",
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Unexpected response status ${response.status} for ${url}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    const encoding = sniffEncoding(buffer, response.headers.get("content-type"));

    return decodeBuffer(buffer, encoding);
  } finally {
    clearTimeout(timeout);
  }
}
