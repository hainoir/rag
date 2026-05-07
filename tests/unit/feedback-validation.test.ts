import assert from "node:assert/strict";

import { parseSearchFeedbackPayload } from "../../src/lib/search/feedback.ts";

function test(name: string, task: () => void) {
  try {
    task();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exitCode = 1;
  }
}

test("parses valid feedback payloads", () => {
  const parsed = parseSearchFeedbackPayload({
    requestId: " req-1 ",
    query: " 图书馆借书 ",
    rating: "up",
    reason: " helpful ",
    sourceIds: [" source-1 ", "source-2"],
  });

  assert.equal(parsed.ok, true);

  if (parsed.ok) {
    assert.deepEqual(parsed.feedback, {
      requestId: "req-1",
      query: "图书馆借书",
      rating: "up",
      reason: "helpful",
      sourceIds: ["source-1", "source-2"],
    });
  }
});

test("rejects missing required fields and invalid ratings", () => {
  assert.deepEqual(parseSearchFeedbackPayload(null), {
    ok: false,
    error: "Payload must be an object.",
  });
  assert.deepEqual(parseSearchFeedbackPayload({ query: "图书馆借书", rating: "up" }), {
    ok: false,
    error: "requestId is required.",
  });
  assert.deepEqual(parseSearchFeedbackPayload({ requestId: "req-1", rating: "up" }), {
    ok: false,
    error: "query is required.",
  });
  assert.deepEqual(parseSearchFeedbackPayload({ requestId: "req-1", query: "图书馆借书", rating: "maybe" }), {
    ok: false,
    error: 'rating must be "up" or "down".',
  });
});

test("truncates reason and filters source ids", () => {
  const parsed = parseSearchFeedbackPayload({
    requestId: "req-1",
    query: "图书馆借书",
    rating: "down",
    reason: "x".repeat(520),
    sourceIds: ["a", "", "  ", "b", 1, "c", "d", "e", "f", "g", "h", "i", "j", "k", "l"],
  });

  assert.equal(parsed.ok, true);

  if (parsed.ok) {
    assert.equal(parsed.feedback.reason?.length, 500);
    assert.deepEqual(parsed.feedback.sourceIds, ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"]);
  }
});

test("omits optional fields when they are empty", () => {
  const parsed = parseSearchFeedbackPayload({
    requestId: "req-1",
    query: "图书馆借书",
    rating: "up",
    reason: " ",
    sourceIds: [],
  });

  assert.equal(parsed.ok, true);

  if (parsed.ok) {
    assert.deepEqual(parsed.feedback, {
      requestId: "req-1",
      query: "图书馆借书",
      rating: "up",
    });
  }
});
