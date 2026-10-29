const MAX_ERROR_NODES = 6;

function readStringField(value: object, key: string) {
  const raw = (value as Record<string, unknown>)[key];

  if (typeof raw === "string" && raw.trim()) {
    return raw.trim();
  }

  return undefined;
}

function readErrno(value: object) {
  const raw = (value as { errno?: unknown }).errno;

  if (typeof raw === "number" && Number.isFinite(raw)) {
    return String(raw);
  }

  if (typeof raw === "string" && raw.trim()) {
    return raw.trim();
  }

  return undefined;
}

function describeErrorNode(value: unknown) {
  if (typeof value === "string") {
    return value.trim();
  }

  if (typeof value !== "object" || value === null) {
    return String(value);
  }

  const name = readStringField(value, "name");
  const message = readStringField(value, "message") || (name && name !== "Error" ? name : "") || "Error";
  const code = readStringField(value, "code");
  const errno = readErrno(value);
  const extras: string[] = [];

  if (name && name !== "Error" && name !== message) {
    extras.push(`name=${name}`);
  }

  if (code) {
    extras.push(`code=${code}`);
  }

  if (errno !== undefined) {
    extras.push(`errno=${errno}`);
  }

  return extras.length > 0 ? `${message} (${extras.join(", ")})` : message;
}

function pushCause(queue: unknown[], value: unknown) {
  if (typeof value !== "object" || value === null) {
    return;
  }

  const record = value as { cause?: unknown; errors?: unknown };

  if (record.cause !== undefined) {
    queue.push(record.cause);
  }

  if (Array.isArray(record.errors)) {
    for (const nested of record.errors.slice(0, 3)) {
      queue.push(nested);
    }
  }
}

export function formatErrorDetail(error: unknown) {
  const parts: string[] = [];
  const seen = new Set<unknown>();
  const queue: unknown[] = [error];

  while (queue.length > 0 && parts.length < MAX_ERROR_NODES) {
    const current = queue.shift();

    if (current == null || (typeof current === "object" && seen.has(current))) {
      continue;
    }

    if (typeof current === "object") {
      seen.add(current);
    }

    const description = describeErrorNode(current);

    if (description) {
      parts.push(description);
    }

    pushCause(queue, current);
  }

  const unique: string[] = [];

  for (const part of parts) {
    if (unique.some((existing) => existing.includes(part))) {
      continue;
    }

    unique.push(part);
  }

  if (unique.length === 0) {
    return "Unknown error";
  }

  if (unique.length === 1) {
    return unique[0];
  }

  return `${unique[0]}; cause: ${unique.slice(1).join("; ")}`;
}

export function toErrorMessage(error: unknown) {
  return formatErrorDetail(error);
}
