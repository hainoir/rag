import "server-only";

import net from "node:net";
import tls from "node:tls";

import type { KeyValueStore } from "@/lib/search/search-gateway";

type RedisValue = string | number | null | RedisValue[];

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
    return {
      value: line,
      offset: nextOffset,
    };
  }

  if (prefix === "-") {
    throw new Error(line);
  }

  if (prefix === ":") {
    return {
      value: Number(line),
      offset: nextOffset,
    };
  }

  if (prefix === "$") {
    const length = Number(line);

    if (length === -1) {
      return {
        value: null,
        offset: nextOffset,
      };
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

    return {
      value: values,
      offset: cursor,
    };
  }

  throw new Error(`Unsupported Redis reply prefix: ${prefix}`);
}

function parseDatabaseIndex(pathname: string) {
  const parsed = Number.parseInt(pathname.replace("/", ""), 10);

  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

async function runRedisCommand(args: Array<string | number>) {
  const connectionUrl = process.env.REDIS_URL?.trim();

  if (!connectionUrl) {
    throw new Error("REDIS_URL is not configured.");
  }

  const parsedUrl = new URL(connectionUrl);
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
    }, 2_000);

    socket.on("connect", () => {
      socket.write(commands.join(""));
    });

    socket.on("data", (chunk) => {
      const data = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      buffer = Buffer.concat([buffer, data]);

      try {
        let cursor = 0;
        let lastValue: RedisValue = null;

        while (expectedReplies > 0) {
          const parsed = parseRedisValue(buffer, cursor);

          if (!parsed) {
            return;
          }

          lastValue = parsed.value;
          cursor = parsed.offset;
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

export function createRedisKeyValueStore(): KeyValueStore | null {
  if (!process.env.REDIS_URL?.trim()) {
    return null;
  }

  return {
    async get(key) {
      const value = await runRedisCommand(["GET", key]);

      return typeof value === "string" ? value : null;
    },
    async set(key, value, ttlSeconds) {
      await runRedisCommand(["SET", key, value, "EX", ttlSeconds]);
    },
    async increment(key, ttlSeconds) {
      const count = await runRedisCommand(["INCR", key]);

      await runRedisCommand(["EXPIRE", key, ttlSeconds]);

      return typeof count === "number" ? count : 0;
    },
  };
}
