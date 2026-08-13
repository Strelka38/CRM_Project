import { NextRequest, NextResponse } from "next/server";
import {
  applyDatabaseBackup,
  parseDatabaseBackup,
} from "@/lib/database-backup";
import { requireFirstCrmUser } from "@/lib/session";

export const maxDuration = 300;

const MAX_BYTES = 50 * 1024 * 1024;

export async function POST(req: NextRequest) {
  try {
    const session = await requireFirstCrmUser();

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Файл обязателен" }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: "Файл больше 50 МБ" },
        { status: 400 },
      );
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(await file.text());
    } catch {
      return NextResponse.json(
        { error: "Файл не является JSON" },
        { status: 400 },
      );
    }

    let backup;
    try {
      backup = parseDatabaseBackup(parsed);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Некорректный файл";
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    const result = await applyDatabaseBackup(backup, session.user.id);
    return NextResponse.json({
      ok: true,
      ...result,
    });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[POST /api/database/import]", e);
    const msg = e instanceof Error ? e.message : "";
    return NextResponse.json(
      { error: msg || "Не удалось импортировать базу" },
      { status: 500 },
    );
  }
}
