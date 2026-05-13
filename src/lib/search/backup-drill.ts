export type BackupDrillConfig = {
  databaseUrl: string | null;
  restoreDatabaseUrl: string | null;
  outputDir: string;
  label: string;
  runVerify: boolean;
  keepArtifacts: boolean;
};

export function readBackupDrillConfig(env = process.env): BackupDrillConfig {
  return {
    databaseUrl: normalizeOptionalString(env.DATABASE_URL),
    restoreDatabaseUrl: normalizeOptionalString(env.BACKUP_DRILL_RESTORE_DATABASE_URL),
    outputDir: normalizeOptionalString(env.BACKUP_DRILL_OUTPUT_DIR) ?? "reports/backup-drills",
    label: normalizeOptionalString(env.BACKUP_DRILL_LABEL) ?? "manual",
    runVerify: parseBooleanFlag(env.BACKUP_DRILL_RUN_VERIFY, true),
    keepArtifacts: parseBooleanFlag(env.BACKUP_DRILL_KEEP_ARTIFACTS, true),
  };
}

export function buildBackupDrillArtifactPaths(config: BackupDrillConfig, timestamp: string) {
  const slug = slugifyLabel(config.label);

  return {
    runDir: `${config.outputDir}/${timestamp}-${slug}`,
    dumpFile: `${config.outputDir}/${timestamp}-${slug}/campus-rag-backup.dump`,
    schemaFile: `${config.outputDir}/${timestamp}-${slug}/campus-rag-schema.sql`,
    manifestFile: `${config.outputDir}/${timestamp}-${slug}/backup-drill-report.json`,
  };
}

export function buildBackupDrillManifest({
  timestamp,
  config,
  paths,
  backupStatus,
  restoreStatus,
  verifyStatus,
}: {
  timestamp: string;
  config: BackupDrillConfig;
  paths: ReturnType<typeof buildBackupDrillArtifactPaths>;
  backupStatus: "pending" | "completed" | "failed";
  restoreStatus: "skipped" | "completed" | "failed";
  verifyStatus: "skipped" | "completed" | "failed";
}) {
  return {
    checkedAt: timestamp,
    label: config.label,
    databaseConfigured: config.databaseUrl !== null,
    restoreDatabaseConfigured: config.restoreDatabaseUrl !== null,
    runVerify: config.runVerify,
    keepArtifacts: config.keepArtifacts,
    artifacts: paths,
    status: {
      backup: backupStatus,
      restore: restoreStatus,
      verify: verifyStatus,
    },
  };
}

function parseBooleanFlag(value: string | undefined, fallback: boolean) {
  const normalized = String(value ?? "").trim().toLowerCase();

  if (!normalized) {
    return fallback;
  }

  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }

  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }

  return fallback;
}

function normalizeOptionalString(value: string | undefined) {
  const normalized = String(value ?? "").trim();
  return normalized.length > 0 ? normalized : null;
}

function slugifyLabel(value: string) {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || "backup-drill";
}
