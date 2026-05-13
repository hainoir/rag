const assert = require("node:assert/strict");

const {
  parseCommunityReviewPatch,
  parseFeedbackPatch,
  parseSourceGovernancePatch,
} = require("../../search-service/admin-store.cjs");

function test(name, task) {
  try {
    task();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exitCode = 1;
  }
}

test("validates source governance patches", () => {
  const parsed = parseSourceGovernancePatch({
    enabled: false,
    trustWeight: 0.61,
    updateCadence: "weekly",
    adminNote: "hold for review",
  });

  assert.equal(parsed.ok, true);
  assert.equal(parsed.patch.enabledOverride, false);
  assert.equal(parsed.patch.trustWeightOverride, 0.61);
  assert.equal(parsed.patch.updateCadenceOverride, "weekly");

  assert.equal(parseSourceGovernancePatch({ trustWeight: 1.1 }).ok, false);
  assert.equal(parseSourceGovernancePatch({ updateCadence: "yearly" }).ok, false);
  assert.equal(parseSourceGovernancePatch({}).ok, false);
});

test("validates feedback status patches", () => {
  const parsed = parseFeedbackPatch({
    status: "resolved",
    adminNote: "answer corrected",
  });

  assert.equal(parsed.ok, true);
  assert.equal(parsed.patch.status, "resolved");
  assert.equal(parsed.patch.adminNote, "answer corrected");
  assert.equal(parseFeedbackPatch({ status: "closed" }).ok, false);
});

test("validates community review patches", () => {
  const parsed = parseCommunityReviewPatch({
    status: "supplemental",
    riskLevel: "medium",
    reason: "experience only",
  });

  assert.equal(parsed.ok, true);
  assert.equal(parsed.patch.status, "supplemental");
  assert.equal(parsed.patch.riskLevel, "medium");
  assert.equal(parseCommunityReviewPatch({ status: "ready" }).ok, false);
  assert.equal(parseCommunityReviewPatch({ riskLevel: "critical" }).ok, false);
});
