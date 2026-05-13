import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

import {
  buildBackupDrillArtifactPaths,
  buildBackupDrillManifest,
  readBackupDrillConfig,
} from "../src/lib/search/backup-drill.ts";

function createTimestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      shell: false,
      ...options,
    });

    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${command} exited with code ${String(code)}`));
    });
  });
}

function resolveNpmCommand() {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

async function ensureFileExists(filePath) {
  const stat = await fs.stat(filePath);

  if (!stat.isFile() || stat.size <= 0) {
    throw new Error(`Expected non-empty file: ${filePath}`);
  }
}

async function writeManifest(filePath, manifest) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

async function removeRunDir(runDir) {
  await fs.rm(runDir, { recursive: true, force: true });
}

async function main() {
  const config = readBackupDrillConfig();

  if (!config.databaseUrl) {
    throw new Error("DATABASE_URL is required to run the backup drill.");
  }

  const timestamp = createTimestamp();
  const paths = buildBackupDrillArtifactPaths(config, timestamp);

  await fs.mkdir(paths.runDir, { recursive: true });

  let backupStatus = "pending";
  let restoreStatus = "skipped";
  let verifyStatus = "skipped";

  try {
    await runCommand("pg_dump", [
      config.databaseUrl,
      "--format=custom",
      "--file",
      path.resolve(process.cwd(), paths.dumpFile),
    ]);
    await runCommand("pg_dump", [
      config.databaseUrl,
      "--schema-only",
      "--file",
      path.resolve(process.cwd(), paths.schemaFile),
    ]);
    await ensureFileExists(path.resolve(process.cwd(), paths.dumpFile));
    await ensureFileExists(path.resolve(process.cwd(), paths.schemaFile));
    backupStatus = "completed";

    if (config.restoreDatabaseUrl) {
      await runCommand("pg_restore", [
        "--clean",
        "--if-exists",
        "--dbname",
        config.restoreDatabaseUrl,
        path.resolve(process.cwd(), paths.dumpFile),
      ]);
      restoreStatus = "completed";

      if (config.runVerify) {
        await runCommand(resolveNpmCommand(), ["run", "smoke:postgres"], {
          env: {
            ...process.env,
            DATABASE_URL: config.restoreDatabaseUrl,
          },
        });
        await runCommand(resolveNpmCommand(), ["run", "test:telemetry:postgres"], {
          env: {
            ...process.env,
            DATABASE_URL: config.restoreDatabaseUrl,
          },
        });
        verifyStatus = "completed";
      }
    }

    const manifest = buildBackupDrillManifest({
      timestamp,
      config,
      paths,
      backupStatus,
      restoreStatus,
      verifyStatus,
    });
    await writeManifest(path.resolve(process.cwd(), paths.manifestFile), manifest);
    console.log(JSON.stringify(manifest, null, 2));
  } catch (error) {
    const manifest = {
      ...buildBackupDrillManifest({
        timestamp,
        config,
        paths,
        backupStatus: backupStatus === "completed" ? "completed" : "failed",
        restoreStatus,
        verifyStatus,
      }),
      error: {
        message: error instanceof Error ? error.message : String(error),
      },
    };
    await writeManifest(path.resolve(process.cwd(), paths.manifestFile), manifest);

    if (!config.keepArtifacts) {
      await removeRunDir(path.resolve(process.cwd(), paths.runDir));
    }

    console.log(JSON.stringify(manifest, null, 2));
    throw error;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
