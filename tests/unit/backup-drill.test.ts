import assert from "node:assert/strict";

import {
  buildBackupDrillArtifactPaths,
  buildBackupDrillManifest,
  readBackupDrillConfig,
} from "../../src/lib/search/backup-drill.ts";

function test(name: string, task: () => void | Promise<void>) {
  Promise.resolve()
    .then(task)
    .then(() => {
      console.log(`PASS ${name}`);
    })
    .catch((error) => {
      console.error(`FAIL ${name}`);
      console.error(error instanceof Error ? error.stack ?? error.message : String(error));
      process.exitCode = 1;
    });
}

test("reads backup drill config with defaults", () => {
  const config = readBackupDrillConfig({} as NodeJS.ProcessEnv);

  assert.equal(config.databaseUrl, null);
  assert.equal(config.restoreDatabaseUrl, null);
  assert.equal(config.outputDir, "reports/backup-drills");
  assert.equal(config.label, "manual");
  assert.equal(config.runVerify, true);
  assert.equal(config.keepArtifacts, true);
});

test("reads backup drill config overrides", () => {
  const config = readBackupDrillConfig({
    DATABASE_URL: "postgres://source",
    BACKUP_DRILL_RESTORE_DATABASE_URL: "postgres://restore",
    BACKUP_DRILL_OUTPUT_DIR: "tmp/drills",
    BACKUP_DRILL_LABEL: "Release Candidate 1",
    BACKUP_DRILL_RUN_VERIFY: "false",
    BACKUP_DRILL_KEEP_ARTIFACTS: "0",
  } as NodeJS.ProcessEnv);

  assert.equal(config.databaseUrl, "postgres://source");
  assert.equal(config.restoreDatabaseUrl, "postgres://restore");
  assert.equal(config.outputDir, "tmp/drills");
  assert.equal(config.label, "Release Candidate 1");
  assert.equal(config.runVerify, false);
  assert.equal(config.keepArtifacts, false);
});

test("builds stable artifact paths using a slugged label", () => {
  const config = readBackupDrillConfig({
    DATABASE_URL: "postgres://source",
    BACKUP_DRILL_OUTPUT_DIR: "reports/backup-drills",
    BACKUP_DRILL_LABEL: "Release Candidate 1",
  } as NodeJS.ProcessEnv);
  const paths = buildBackupDrillArtifactPaths(config, "2026-05-13T00-00-00-000Z");

  assert.equal(paths.runDir, "reports/backup-drills/2026-05-13T00-00-00-000Z-release-candidate-1");
  assert.equal(
    paths.dumpFile,
    "reports/backup-drills/2026-05-13T00-00-00-000Z-release-candidate-1/campus-rag-backup.dump",
  );
  assert.equal(
    paths.manifestFile,
    "reports/backup-drills/2026-05-13T00-00-00-000Z-release-candidate-1/backup-drill-report.json",
  );
});

test("builds backup drill manifests for reporting", () => {
  const config = readBackupDrillConfig({
    DATABASE_URL: "postgres://source",
    BACKUP_DRILL_RESTORE_DATABASE_URL: "postgres://restore",
    BACKUP_DRILL_LABEL: "drill",
  } as NodeJS.ProcessEnv);
  const paths = buildBackupDrillArtifactPaths(config, "2026-05-13T00-00-00-000Z");
  const manifest = buildBackupDrillManifest({
    timestamp: "2026-05-13T00-00-00-000Z",
    config,
    paths,
    backupStatus: "completed",
    restoreStatus: "completed",
    verifyStatus: "completed",
  });

  assert.equal(manifest.databaseConfigured, true);
  assert.equal(manifest.restoreDatabaseConfigured, true);
  assert.equal(manifest.status.backup, "completed");
  assert.equal(manifest.status.restore, "completed");
  assert.equal(manifest.status.verify, "completed");
  assert.equal(manifest.artifacts, paths);
});
