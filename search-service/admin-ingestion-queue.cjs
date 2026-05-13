const crypto = require("node:crypto");
const net = require("node:net");
const tls = require("node:tls");

const DEFAULT_QUEUE_NAME = "campus-rag:ingestion";

function encodeCommand(args) {
  const chunks = [`*${args.length}\r\n`];

  for (const arg of args) {
    const value = String(arg);
    chunks.push(`$${Buffer.byteLength(value)}\r\n${value}\r\n`);
  }

  return chunks.join("");
}

function parseRedisValue(buffer, offset = 0) {
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

  if (prefix === "+" || prefix === ":") {
    return { value: prefix === ":" ? Number(line) : line, offset: nextOffset };
  }

  if (prefix === "-") {
    throw new Error(line);
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

  throw new Error(`Unsupported Redis reply prefix: ${prefix}`);
}

function parseDatabaseIndex(pathname) {
  const parsed = Number.parseInt(pathname.replace("/", ""), 10);

  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function getQueueName(env = process.env) {
  return String(env.INGEST_QUEUE_NAME ?? DEFAULT_QUEUE_NAME).trim() || DEFAULT_QUEUE_NAME;
}

function getRedisUrl(env = process.env) {
  const redisUrl = String(env.REDIS_URL ?? "").trim();

  if (!redisUrl) {
    const error = new Error("REDIS_URL is required for queued ingestion.");
    error.code = "ingestion_queue_unconfigured";
    error.statusCode = 503;
    throw error;
  }

  return redisUrl;
}

async function runRedisCommand(args, env = process.env) {
  const parsedUrl = new URL(getRedisUrl(env));
  const useTls = parsedUrl.protocol === "rediss:";
  const port = Number(parsedUrl.port || (useTls ? 6380 : 6379));
  const commands = [];

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

  return new Promise((resolve, reject) => {
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
        let lastValue = null;

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

async function enqueueAdminSourceIngestion(sourceId, env = process.env) {
  const job = {
    id: crypto.randomUUID(),
    kind: "source",
    sourceIds: [sourceId],
    enqueuedAt: new Date().toISOString(),
  };

  await runRedisCommand(["LPUSH", getQueueName(env), JSON.stringify(job)], env);
  return job;
}

module.exports = {
  enqueueAdminSourceIngestion,
};
