import { mkdir, writeFile, unlink } from "fs/promises";
import path from "path";
import { randomBytes } from "crypto";

export const UPLOAD_ROOT = path.join(process.cwd(), "uploads");

export const ALLOWED_MIME = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "image/png",
  "image/jpeg",
]);

export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

const EXT_BY_MIME: Record<string, string> = {
  "application/pdf": ".pdf",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
  "application/vnd.ms-excel": ".xls",
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
  "image/gif": ".gif",
};

const MIME_BY_EXT: Record<string, string> = {
  ".pdf": "application/pdf",
  ".xlsx":
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".xls": "application/vnd.ms-excel",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

export function isAllowedMime(mime: string) {
  return ALLOWED_MIME.has(mime);
}

/** Resolve MIME when browser leaves File.type empty. */
export function resolveUploadMime(file: { type: string; name: string }) {
  if (file.type && isAllowedMime(file.type)) return file.type;
  const ext = path.extname(file.name || "").toLowerCase();
  return MIME_BY_EXT[ext] || "";
}

export const IMAGE_MIME = new Set(["image/png", "image/jpeg"]);

export async function saveQuoteUpload(
  quoteId: string,
  mimeType: string,
  data: Buffer,
): Promise<{ storagePath: string; absPath: string }> {
  const ext = EXT_BY_MIME[mimeType] || "";
  const dir = path.join(UPLOAD_ROOT, "quotes", quoteId);
  await mkdir(dir, { recursive: true });
  const filename = `${Date.now()}-${randomBytes(8).toString("hex")}${ext}`;
  const absPath = path.join(dir, filename);
  await writeFile(absPath, data);
  const storagePath = path.join("quotes", quoteId, filename);
  return { storagePath, absPath };
}

export async function saveCatalogItemPhoto(
  itemId: string,
  mimeType: string,
  data: Buffer,
): Promise<{ storagePath: string; absPath: string }> {
  const ext = EXT_BY_MIME[mimeType] || "";
  const dir = path.join(UPLOAD_ROOT, "catalog", itemId);
  await mkdir(dir, { recursive: true });
  const filename = `${Date.now()}-${randomBytes(8).toString("hex")}${ext}`;
  const absPath = path.join(dir, filename);
  await writeFile(absPath, data);
  const storagePath = path.join("catalog", itemId, filename);
  return { storagePath, absPath };
}

export async function saveVenuePhoto(
  venueId: string,
  mimeType: string,
  data: Buffer,
): Promise<{ storagePath: string; filename: string; absPath: string }> {
  const ext = EXT_BY_MIME[mimeType] || "";
  const dir = path.join(UPLOAD_ROOT, "venues", venueId);
  await mkdir(dir, { recursive: true });
  const filename = `${Date.now()}-${randomBytes(8).toString("hex")}${ext}`;
  const absPath = path.join(dir, filename);
  await writeFile(absPath, data);
  const storagePath = path.join("venues", venueId, filename);
  return { storagePath, filename, absPath };
}

export async function saveEquipmentDocument(
  catalogItemId: string,
  mimeType: string,
  data: Buffer,
): Promise<{ storagePath: string; absPath: string }> {
  const ext = EXT_BY_MIME[mimeType] || "";
  const dir = path.join(UPLOAD_ROOT, "equipment", catalogItemId);
  await mkdir(dir, { recursive: true });
  const filename = `${Date.now()}-${randomBytes(8).toString("hex")}${ext}`;
  const absPath = path.join(dir, filename);
  await writeFile(absPath, data);
  const storagePath = path.join("equipment", catalogItemId, filename);
  return { storagePath, absPath };
}

export async function saveEquipmentRepairPhoto(
  repairId: string,
  mimeType: string,
  data: Buffer,
): Promise<{ storagePath: string; absPath: string }> {
  const ext = EXT_BY_MIME[mimeType] || "";
  const dir = path.join(UPLOAD_ROOT, "repairs", repairId);
  await mkdir(dir, { recursive: true });
  const filename = `${Date.now()}-${randomBytes(8).toString("hex")}${ext}`;
  const absPath = path.join(dir, filename);
  await writeFile(absPath, data);
  const storagePath = path.join("repairs", repairId, filename);
  return { storagePath, absPath };
}

export async function saveLegalEntityImage(
  entityId: string,
  kind: "seal" | "signature",
  mimeType: string,
  data: Buffer,
): Promise<{ storagePath: string; absPath: string }> {
  const ext = EXT_BY_MIME[mimeType] || ".png";
  const dir = path.join(UPLOAD_ROOT, "legal", entityId);
  await mkdir(dir, { recursive: true });
  const filename = `${kind}-${Date.now()}-${randomBytes(4).toString("hex")}${ext}`;
  const absPath = path.join(dir, filename);
  await writeFile(absPath, data);
  const storagePath = path.join("legal", entityId, filename);
  return { storagePath, absPath };
}

export function newQrToken() {
  return randomBytes(12).toString("base64url");
}

export function mimeFromStoragePath(storagePath: string) {
  const ext = path.extname(storagePath).toLowerCase();
  return MIME_BY_EXT[ext] || "application/octet-stream";
}

export function resolveUploadPath(storagePath: string) {
  const abs = path.resolve(UPLOAD_ROOT, storagePath);
  if (!abs.startsWith(path.resolve(UPLOAD_ROOT))) {
    throw new Error("Invalid storage path");
  }
  return abs;
}

export async function deleteUploadFile(storagePath: string) {
  try {
    await unlink(resolveUploadPath(storagePath));
  } catch {
    // ignore missing files
  }
}
