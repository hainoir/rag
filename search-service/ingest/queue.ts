import crypto from "node:crypto";
import net from "node:net";
import tls from "node:tls";

import { DEFAULT_COMMUNITY_SOURCE_IDS, DEFAULT_OFFICIAL_SOURCE_IDS } from "./types.ts";

type RedisValue = string | number | null | RedisValue[];

export type IngestionQueueJobKind = "official" | "community" | "source";

export type IngestionQueueJob = {
  id: string;
  kind: IngestionQueueJobKind;
  sourceIds: string[];
  enqueuedAt: string;
};

const DEFAULT_QUEUE_NAME = "campus-rag:ingestion";

function encodeCommand(args: Array<string | number>) {
  const chunks = [`*${args.length}\r\n`];

  for (const arg of args) {
    const value = String(arg);
    chunks.push(`$${Buffer.byteLength(value)}\r\n${value}\r\n`);
  }

  return chunks.join("");
}

function parseRedisValue(buffer: Buffer, offset = 0): { value: RedisValue; offset: number } | null {
  if (offset >= buffer.length) {
    return null;
  }

  const prefix = String.fromCharCode(buffer[offset]);
  const lineEnd = buffer.indexOf("\r\n", offset);

  if (lineEnd === -1) {
    return null;
  }

  const line = buffer.toString("utf8", offset + 1, lineEnd);
  const nextOffset = lineEnd + 2;

  if (prefix === "+") {
    return { value: line, offset: nextOffset };
  }

  if (prefix === "-") {
    throw new Error(line);
  }

  if (prefix === ":") {
    return { value: Number(line), offset: nextOffset };
  }

  if (prefix === "$") {
    const length = Number(line);

    if (length === -1) {
      return { value: null, offset: nextOffset };
    }

    const valueEnd = nextOffset + length;

    if (buffer.length < valueEnd + 2) {
      return null;
    }

    return {
      value: buffer.toString("utf8", nextOffset, valueEnd),
      offset: valueEnd + 2,
    };
  }

  if (prefix === "*") {
    const length = Number(line);
    const values: RedisValue[] = [];
    let cursor = nextOffset;

    for (let index = 0; index < length; index += 1) {
      const parsed = parseRedisValue(buffer, cursor);

      if (!parsed) {
        return null;
      }

      values.push(parsed.value);
      cursor = parsed.offset;
    }

    return { value: values, offset: cursor };
  }

  throw new Error(`Unsupported Redis reply prefix: ${prefix}`);
}

function parseDatabaseIndex(pathname: string) {
  const parsed = Number.parseInt(pathname.replace("/", ""), 10);

  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function getQueueName(env = process.env) {
  return String(env.INGEST_QUEUE_NAME ?? DEFAULT_QUEUE_NAME).trim() || DEFAULT_QUEUE_NAME;
}

function getRedisUrl(env = process.env) {
  const redisUrl = String(env.REDIS_URL ?? "").trim();

  if (!redisUrl) {
    throw new Error("REDIS_URL is required for queued ingestion.");
  }

  return redisUrl;
}

async function runRedisCommand(args: Array<string | number>, env = process.env) {
  const parsedUrl = new URL(getRedisUrl(env));
  const useTls = parsedUrl.protocol === "rediss:";
  const port = Number(parsedUrl.port || (useTls ? 6380 : 6379));
  const commands: string[] = [];

  if (parsedUrl.password) {
    commands.push(
      parsedUrl.username
        ? encodeCommand(["AUTH", decodeURIComponent(parsedUrl.username), decodeURIComponent(parsedUrl.password)])
        : encodeCommand(["AUTH", decodeURIComponent(parsedUrl.password)]),
    );
  }

  const databaseIndex = parseDatabaseIndex(parsedUrl.pathname);

  if (databaseIndex !== null && databaseIndex > 0) {
    commands.push(encodeCommand(["SELECT", databaseIndex]));
  }

  commands.push(encodeCommand(args));

  return new Promise<RedisValue>((resolve, reject) => {
    const socket = useTls
      ? tls.connect({ host: parsedUrl.hostname, port, servername: parsedUrl.hostname })
      : net.createConnection({ host: parsedUrl.hostname, port });
    let buffer = Buffer.alloc(0);
    let expectedReplies = commands.length;

    const timeout = setTimeout(() => {
      socket.destroy(new Error("Redis command timed out."));
    }, 3_000);

    socket.on("connect", () => {
      socket.write(commands.join(""));
    });

    socket.on("data", (chunk) => {
      buffer = Buffer.concat([buffer, Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)]);

      try {
        let lastValue: RedisValue = null;

        while (expectedReplies > 0) {
          const parsed = parseRedisValue(buffer, 0);

          if (!parsed) {
            return;
          }

          lastValue = parsed.value;
          buffer = buffer.subarray(parsed.offset);
          expectedReplies -= 1;
        }

        clearTimeout(timeout);
        socket.end();
        resolve(lastValue);
      } catch (error) {
        clearTimeout(timeout);
        socket.destroy();
        reject(error);
      }
    });

    socket.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}

export function buildIngestionQueueJob(kind: IngestionQueueJobKind, sourceIds: string[]): IngestionQueueJob {
  return {
    id: crypto.randomUUID(),
    kind,
    sourceIds,
    enqueuedAt: new Date().toISOString(),
  };
}

export function resolveQueuedSourceIds(kind: IngestionQueueJobKind, sourceIds: string[]) {
  if (sourceIds.length > 0) {
    return sourceIds;
  }

  if (kind === "community") {
    return [...DEFAULT_COMMUNITY_SOURCE_IDS];
  }

  return [...DEFAULT_OFFICIAL_SOURCE_IDS];
}

export async function enqueueIngestionJob(kind: IngestionQueueJobKind, sourceIds: string[], env = process.env) {
  const job = buildIngestionQueueJob(kind, resolveQueuedSourceIds(kind, sourceIds));
  await runRedisCommand(["LPUSH", getQueueName(env), JSON.stringify(job)], env);

  return job;
}

export async function dequeueIngestionJob(env = process.env) {
  const value = await runRedisCommand(["RPOP", getQueueName(env)], env);

  if (typeof value !== "string") {
    return null;
  }

  const parsed = JSON.parse(value) as Partial<IngestionQueueJob>;

  if (!parsed.id || !parsed.kind || !Array.isArray(parsed.sourceIds)) {
    throw new Error("Invalid queued ingestion job payload.");
  }

  return {
    id: parsed.id,
    kind: parsed.kind,
    sourceIds: parsed.sourceIds,
    enqueuedAt: parsed.enqueuedAt ?? new Date().toISOString(),
  } satisfies IngestionQueueJob;
}
