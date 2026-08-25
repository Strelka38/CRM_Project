import { spawn } from "node:child_process";
import {
  copyFile,
  cp,
  mkdir,
  mkdtemp,
  open,
  readdir,
  rename,
  rm,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { UPLOAD_ROOT } from "@/lib/uploads";

export const FULL_BACKUP_KIND = "baikal-crm-full";
export const FULL_BACKUP_VERSION = 1;
export const FULL_BACKUP_FILE_RE = /^crm-full-\d{8}-\d{4}\.tar\.gz$/;

const STALE_LOCK_MS = 2 * 60 * 60 * 1000;

export type FullBackupManifest = {
  kind: typeof FULL_BACKUP_KIND;
  version: number;
  createdAt: string;
  database: string;
  postgres: string;
};

export type FullBackupListItem = {
  filename: string;
  size: number;
  mtime: string;
};

export function backupRoot() {
  return process.env.BACKUP_DIR || path.join(process.cwd(), "backups");
}

export function isBackupFilename(name: string) {
  return FULL_BACKUP_FILE_RE.test(name);
}

export function backupFilenameFromDate(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
  return `crm-full-${stamp}.tar.gz`;
}

/** Strip Prisma query params so pg_dump accepts the URL. */
export function pgDumpConnectionString(databaseUrl: string) {
  const u = new URL(databaseUrl);
  u.search = "";
  return u.toString();
}

export function databaseNameFromUrl(databaseUrl: string) {
  const u = new URL(databaseUrl);
  return decodeURIComponent(u.pathname.replace(/^\//, "")) || "crm_event";
}

export function parseFullBackupManifest(value: unknown): FullBackupManifest {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("manifest.json повреждён");
  }
  const rec = value as Record<string, unknown>;
  if (rec.kind !== FULL_BACKUP_KIND) {
    throw new Error("Это не полный снимок CRM");
  }
  const version = Number(rec.version);
  if (!Number.isFinite(version) || version < 1) {
    throw new Error("Неизвестная версия снимка");
  }
  return {
    kind: FULL_BACKUP_KIND,
    version,
    createdAt: typeof rec.createdAt === "string" ? rec.createdAt : "",
    database: typeof rec.database === "string" ? rec.database : "",
    postgres: typeof rec.postgres === "string" ? rec.postgres : "",
  };
}

export function resolveBackupFile(filename: string) {
  if (!isBackupFilename(filename)) {
    throw new Error("Некорректное имя файла");
  }
  const root = path.resolve(backupRoot());
  const abs = path.resolve(root, filename);
  if (!abs.startsWith(root + path.sep) && abs !== root) {
    throw new Error("Некорректное имя файла");
  }
  return abs;
}

export async function listFullBackups(): Promise<FullBackupListItem[]> {
  const root = backupRoot();
  let names: string[] = [];
  try {
    names = await readdir(root);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return [];
    throw err;
  }
  const items: FullBackupListItem[] = [];
  for (const name of names) {
    if (!isBackupFilename(name)) continue;
    const abs = path.join(root, name);
    try {
      const st = await stat(abs);
      if (!st.isFile()) continue;
      items.push({
        filename: name,
        size: st.size,
        mtime: st.mtime.toISOString(),
      });
    } catch {
      // skip unreadable
    }
  }
  items.sort((a, b) => b.mtime.localeCompare(a.mtime));
  return items;
}

export function backupsToDelete(
  filenamesNewestFirst: string[],
  keep: number,
): string[] {
  if (!Number.isFinite(keep) || keep < 1) return [];
  return filenamesNewestFirst.slice(keep);
}

export async function rotateFullBackups(keep = backupKeep()) {
  const items = await listFullBackups();
  const drop = backupsToDelete(
    items.map((i) => i.filename),
    keep,
  );
  for (const name of drop) {
    await unlink(resolveBackupFile(name)).catch(() => undefined);
  }
  return drop;
}

export function backupKeep() {
  const n = Number(process.env.BACKUP_KEEP || 14);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : 14;
}

async function runCommand(cmd: string, args: string[]) {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("error", (err) => {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        reject(
          new Error(
            `${cmd} не найден. На сервере используйте ./scripts/backup.sh`,
          ),
        );
        return;
      }
      reject(err);
    });
    child.on("close", (code) => {
      if (code === 0) resolve();
      else
        reject(
          new Error(stderr.trim() || `${cmd} завершился с кодом ${code}`),
        );
    });
  });
}

async function acquireLock(lockPath: string) {
  try {
    return await open(lockPath, "wx");
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== "EEXIST") throw err;
    try {
      const st = await stat(lockPath);
      if (Date.now() - st.mtimeMs > STALE_LOCK_MS) {
        await unlink(lockPath);
        return await open(lockPath, "wx");
      }
    } catch {
      // fall through
    }
    throw new Error("Уже создаётся другой снимок — подождите");
  }
}

async function pathExists(abs: string) {
  try {
    await stat(abs);
    return true;
  } catch {
    return false;
  }
}

async function moveFile(from: string, to: string) {
  try {
    await rename(from, to);
  } catch {
    await copyFile(from, to);
    await unlink(from);
  }
}

export async function createFullBackup(): Promise<FullBackupListItem> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL не задан");
  }

  const root = backupRoot();
  await mkdir(root, { recursive: true });
  const lockPath = path.join(root, ".creating.lock");
  const lock = await acquireLock(lockPath);

  const workdir = await mkdtemp(
    path.join(os.tmpdir(), `crm-full-backup-${process.pid}-`),
  );
  try {
    const dumpPath = path.join(workdir, "postgres.dump");
    const uploadsDest = path.join(workdir, "uploads");

    const conn = pgDumpConnectionString(databaseUrl);
    await runCommand("pg_dump", ["-Fc", "-f", dumpPath, conn]);

    try {
      await cp(UPLOAD_ROOT, uploadsDest, { recursive: true, force: true });
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== "ENOENT") throw err;
      await mkdir(uploadsDest, { recursive: true });
    }

    const manifest: FullBackupManifest = {
      kind: FULL_BACKUP_KIND,
      version: FULL_BACKUP_VERSION,
      createdAt: new Date().toISOString(),
      database: databaseNameFromUrl(databaseUrl),
      postgres: "PostgreSQL 16",
    };
    await writeFile(
      path.join(workdir, "manifest.json"),
      `${JSON.stringify(manifest, null, 2)}\n`,
      "utf8",
    );

    let filename = backupFilenameFromDate(new Date());
    let dest = path.join(root, filename);
    if (await pathExists(dest)) {
      filename = backupFilenameFromDate(new Date(Date.now() + 60_000));
      dest = path.join(root, filename);
    }

    const tmpArchive = `${dest}.partial`;
    await runCommand("tar", [
      "-czf",
      tmpArchive,
      "-C",
      workdir,
      "manifest.json",
      "postgres.dump",
      "uploads",
    ]);
    await moveFile(tmpArchive, dest);

    await rotateFullBackups();
    const st = await stat(dest);
    return {
      filename,
      size: st.size,
      mtime: st.mtime.toISOString(),
    };
  } finally {
    await rm(workdir, { recursive: true, force: true }).catch(() => undefined);
    await lock.close().catch(() => undefined);
    await unlink(lockPath).catch(() => undefined);
  }
}
