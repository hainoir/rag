import fs from "node:fs";
import path from "node:path";

const allowedStatuses = new Set(["ok", "partial", "empty", "error"]);
const allowedSourceTypes = new Set(["official", "community"]);
const allowedFreshness = new Set(["fresh", "recent", "stale", "undated"]);

function fail(message) {
  throw new Error(message);
}

function assert(condition, message) {
  if (!condition) {
    fail(message);
  }
}

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOwn(record, key) {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function isIsoUtcTimestamp(value) {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) &&
    !Number.isNaN(Date.parse(value))
  );
}

function assertIsoUtcTimestamp(value, fieldPath) {
  assert(isIsoUtcTimestamp(value), `${fieldPath} must be a UTC ISO 8601 timestamp.`);
}

function assertString(value, fieldPath) {
  assert(typeof value === "string" && value.trim().length > 0, `${fieldPath} must be a non-empty string.`);
}

function assertStringArray(value, fieldPath) {
  assert(Array.isArray(value), `${fieldPath} must be an array.`);
  value.forEach((item, index) => assertString(item, `${fieldPath}[${index}]`));
}

function assertNullableTimestamp(value, fieldPath) {
  assert(value === null || isIsoUtcTimestamp(value), `${fieldPath} must be null or a UTC ISO 8601 timestamp.`);
}

function pickFreshnessReferenceTimestamp(source) {
  return source.lastVerifiedAt ?? source.updatedAt ?? source.publishedAt ?? source.fetchedAt ?? null;
}

function deriveFreshnessLabel(source, generatedAt) {
  const referenceTimestamp = pickFreshnessReferenceTimestamp(source);

  if (!referenceTimestamp) {
    return "undated";
  }

  const generatedAtMs = Date.parse(generatedAt);
  const referenceMs = Date.parse(referenceTimestamp);

  if (Number.isNaN(generatedAtMs) || Number.isNaN(referenceMs)) {
    return "undated";
  }

  const ageInDays = Math.floor((generatedAtMs - referenceMs) / (1000 * 60 * 60 * 24));

  if (ageInDays <= 3) {
    return "fresh";
  }

  if (ageInDays <= 30) {
    return "recent";
  }

  return "stale";
}

function validateAnswer(answer, status, sources) {
  if (status === "empty" || status === "error") {
    assert(answer === null, `answer must be null when status is "${status}".`);
    return;
  }

  assert(isPlainObject(answer), `answer must be an object when status is "${status}".`);
  assertString(answer.summary, "answer.summary");
  assertString(answer.sourceNote, "answer.sourceNote");
  assertString(answer.disclaimer, "answer.disclaimer");
  assert(
    typeof answer.confidence === "number" && answer.confidence >= 0 && answer.confidence <= 1,
    "answer.confidence must be a number between 0 and 1.",
  );

  if (hasOwn(answer, "evidence")) {
    assert(Array.isArray(answer.evidence), "answer.evidence must be an array when provided.");
    const sourceIds = new Set(sources.map((source) => source.id));

    answer.evidence.forEach((item, index) => {
      const base = `answer.evidence[${index}]`;

      assert(isPlainObject(item), `${base} must be an object.`);
      assertString(item.sourceId, `${base}.sourceId`);
      assert(sourceIds.has(item.sourceId), `${base}.sourceId must reference a source in this response.`);
      assertString(item.title, `${base}.title`);

      if (hasOwn(item, "sourceName") && item.sourceName !== undefined && item.sourceName !== null) {
        assertString(item.sourceName, `${base}.sourceName`);
      }

      if (hasOwn(item, "snippet") && item.snippet !== undefined && item.snippet !== null) {
        assertString(item.snippet, `${base}.snippet`);
      }
    });
  }
}

function validateSource(source, index, generatedAt) {
  const base = `sources[${index}]`;

  assert(isPlainObject(source), `${base} must be an object.`);
  assertString(source.id, `${base}.id`);
  assertString(source.title, `${base}.title`);
  assert(allowedSourceTypes.has(source.type), `${base}.type must be "official" or "community".`);
  assert(hasOwn(source, "sourceName"), `${base}.sourceName must exist.`);
  assertString(source.sourceName, `${base}.sourceName`);
  assert(hasOwn(source, "updatedAt"), `${base}.updatedAt must exist even when unknown.`);
  assertNullableTimestamp(source.updatedAt, `${base}.updatedAt`);
  assert(hasOwn(source, "fetchedAt"), `${base}.fetchedAt must exist.`);
  assertIsoUtcTimestamp(source.fetchedAt, `${base}.fetchedAt`);
  assert(hasOwn(source, "lastVerifiedAt"), `${base}.lastVerifiedAt must exist even when unknown.`);
  assertNullableTimestamp(source.lastVerifiedAt, `${base}.lastVerifiedAt`);
  assertString(source.snippet, `${base}.snippet`);
  assertStringArray(source.matchedKeywords, `${base}.matchedKeywords`);
  assert(hasOwn(source, "freshnessLabel"), `${base}.freshnessLabel must exist.`);
  assert(
    allowedFreshness.has(source.freshnessLabel),
    `${base}.freshnessLabel must be one of ${Array.from(allowedFreshness).join(", ")}.`,
  );

  if (hasOwn(source, "publishedAt")) {
    assertNullableTimestamp(source.publishedAt, `${base}.publishedAt`);
  }

  if (hasOwn(source, "sourceDomain") && source.sourceDomain !== undefined && source.sourceDomain !== null) {
    assertString(source.sourceDomain, `${base}.sourceDomain`);
  }

  if (hasOwn(source, "fullSnippet") && source.fullSnippet !== undefined && source.fullSnippet !== null) {
    assertString(source.fullSnippet, `${base}.fullSnippet`);
  }

  if (hasOwn(source, "url") && source.url !== undefined && source.url !== null) {
    assertString(source.url, `${base}.url`);
  }

  if (hasOwn(source, "canonicalUrl") && source.canonicalUrl !== undefined && source.canonicalUrl !== null) {
    assertString(source.canonicalUrl, `${base}.canonicalUrl`);
  }

  if (hasOwn(source, "trustScore") && source.trustScore !== undefined && source.trustScore !== null) {
    assert(
      typeof source.trustScore === "number" && source.trustScore >= 0 && source.trustScore <= 1,
      `${base}.trustScore must be a number between 0 and 1.`,
    );
  }

  if (hasOwn(source, "dedupKey") && source.dedupKey !== undefined && source.dedupKey !== null) {
    assertString(source.dedupKey, `${base}.dedupKey`);
  }

  const expectedFreshness = deriveFreshnessLabel(source, generatedAt);
  assert(
    source.freshnessLabel === expectedFreshness,
    `${base}.freshnessLabel should be "${expectedFreshness}" based on resultGeneratedAt and source timestamps.`,
  );
}

function validateResponse(response) {
  assert(isPlainObject(response), "The response root must be an object.");

  assertString(response.query, "query");
  assert(allowedStatuses.has(response.status), "status must be one of ok, partial, empty, error.");
  assert(Array.isArray(response.sources), "sources must be an array.");
  assertStringArray(response.relatedQuestions, "relatedQuestions");
  assert(
    Number.isInteger(response.retrievedCount) && response.retrievedCount >= response.sources.length,
    "retrievedCount must be an integer greater than or equal to sources.length.",
  );
  assertIsoUtcTimestamp(response.resultGeneratedAt, "resultGeneratedAt");

  validateAnswer(response.answer, response.status, response.sources);

  if (response.status === "empty" || response.status === "error") {
    assert(response.sources.length === 0, `sources must be empty when status is "${response.status}".`);
  } else {
    assert(response.sources.length > 0, `sources must be non-empty when status is "${response.status}".`);
  }

  response.sources.forEach((source, index) => validateSource(source, index, response.resultGeneratedAt));
}

const inputPath = process.argv[2]
  ? path.resolve(process.cwd(), process.argv[2])
  : path.resolve(process.cwd(), "fixtures/search-response.json");
const raw = fs.readFileSync(inputPath, "utf8");
const parsed = JSON.parse(raw);

validateResponse(parsed);
console.log(`Search API contract validation passed: ${inputPath}`);
