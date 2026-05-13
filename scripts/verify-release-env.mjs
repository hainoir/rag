const mode = process.argv[2];

function hasValue(name) {
  return typeof process.env[name] === "string" && process.env[name].trim().length > 0;
}

function formatMissing(name, reason) {
  return `- ${name}: ${reason}`;
}

function checkPostgresGate() {
  const missing = [];

  if (!hasValue("DATABASE_URL")) {
    missing.push(formatMissing("DATABASE_URL", "required for real-data, telemetry, and admin Postgres validation."));
  }

  if (!hasValue("EMBEDDING_API_KEY")) {
    missing.push(formatMissing("EMBEDDING_API_KEY", "required for verify:retrieval:real hybrid/vector validation."));
  }

  return missing;
}

function checkOpsGate() {
  const missing = [];
  const hasSearchServiceUrl = hasValue("SEARCH_SERVICE_URL");
  const hasDirectOpsUrls = hasValue("SEARCH_SERVICE_HEALTH_URL") && hasValue("SEARCH_SERVICE_METRICS_URL");

  if (!hasSearchServiceUrl && !hasDirectOpsUrls) {
    missing.push(
      formatMissing(
        "SEARCH_SERVICE_URL or SEARCH_SERVICE_HEALTH_URL + SEARCH_SERVICE_METRICS_URL",
        "required for release ops health and metrics validation.",
      ),
    );
  }

  if (!hasValue("OPS_ALERT_WEBHOOK_URL")) {
    missing.push(formatMissing("OPS_ALERT_WEBHOOK_URL", "required so release ops notification cannot silently skip."));
  }

  if (!hasValue("DATABASE_URL")) {
    missing.push(formatMissing("DATABASE_URL", "required for backup:drill."));
  }

  if (!hasValue("BACKUP_DRILL_RESTORE_DATABASE_URL")) {
    missing.push(
      formatMissing(
        "BACKUP_DRILL_RESTORE_DATABASE_URL",
        "required so release backup drill includes restore validation, not only backup export.",
      ),
    );
  }

  return missing;
}

const checks = {
  postgres: checkPostgresGate,
  ops: checkOpsGate,
};

if (!checks[mode]) {
  console.error("Usage: node scripts/verify-release-env.mjs <postgres|ops>");
  process.exit(1);
}

const missing = checks[mode]();

if (missing.length > 0) {
  console.error(`Release ${mode} gate is blocked by missing environment:`);
  console.error(missing.join("\n"));
  process.exit(1);
}

console.log(`Release ${mode} gate environment checks passed.`);
