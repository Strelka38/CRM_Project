import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { NextRequest, NextResponse } from "next/server";
import {
  createFullBackup,
  isBackupFilename,
  listFullBackups,
  resolveBackupFile,
} from "@/lib/full-backup";
import { requireDatabaseBackup } from "@/lib/session";

export const maxDuration = 600;

export async function GET(req: NextRequest) {
  try {
    await requireDatabaseBackup();
    const file = req.nextUrl.searchParams.get("file");
    if (!file) {
      const backups = await listFullBackups();
      return NextResponse.json({ backups });
    }
    if (!isBackupFilename(file)) {
      return NextResponse.json({ error: "Некорректное имя файла" }, { status: 400 });
    }
    const abs = resolveBackupFile(file);
    const st = await stat(abs);
    const stream = Readable.toWeb(
      createReadStream(abs),
    ) as ReadableStream<Uint8Array>;
    return new NextResponse(stream, {
      headers: {
        "Content-Type": "application/gzip",
        "Content-Disposition": `attachment; filename="${file}"; filename*=UTF-8''${encodeURIComponent(file)}`,
        "Content-Length": String(st.size),
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    if (e instanceof Response) return e;
    const code = (e as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      return NextResponse.json({ error: "Файл не найден" }, { status: 404 });
    }
    console.error("[GET /api/database/full-backup]", e);
    return NextResponse.json(
      { error: "Не удалось прочитать снимок" },
      { status: 500 },
    );
  }
}

export async function POST() {
  try {
    await requireDatabaseBackup();
    const backup = await createFullBackup();
    return NextResponse.json({ ok: true, backup });
  } catch (e) {
    if (e instanceof Response) return e;
    const message = e instanceof Error ? e.message : "Не удалось создать снимок";
    console.error("[POST /api/database/full-backup]", e);
    const status = message.includes("другой снимок") ? 409 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
