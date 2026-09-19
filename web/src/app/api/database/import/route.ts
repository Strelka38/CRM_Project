import { NextRequest, NextResponse } from "next/server";
import {
  applyDatabaseBackup,
  parseDatabaseBackup,
} from "@/lib/database-backup";
import { requireDatabaseBackup } from "@/lib/session";

export const maxDuration = 600;

const MAX_BYTES = 50 * 1024 * 1024;

async function readBackupPayload(req: NextRequest): Promise<
  { ok: true; parsed: unknown } | { ok: false; response: NextResponse }
> {
  const contentLength = Number(req.headers.get("content-length") || 0);
  if (contentLength > MAX_BYTES) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Файл больше 50 МБ" },
        { status: 400 },
      ),
    };
  }

  const contentType = req.headers.get("content-type") || "";
  if (
    contentType.includes("application/json") ||
    contentType.includes("text/plain")
  ) {
    const text = await req.text();
    if (Buffer.byteLength(text, "utf8") > MAX_BYTES) {
      return {
        ok: false,
        response: NextResponse.json(
          { error: "Файл больше 50 МБ" },
          { status: 400 },
        ),
      };
    }
    try {
      return { ok: true, parsed: JSON.parse(text) };
    } catch {
      return {
        ok: false,
        response: NextResponse.json(
          { error: "Файл не является JSON" },
          { status: 400 },
        ),
      };
    }
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error:
            "Не удалось прочитать файл. Обычно так бывает, если бэкап больше 10 МБ — обновите страницу и импортируйте снова.",
        },
        { status: 400 },
      ),
    };
  }
  const file = form.get("file");
  if (!(file instanceof File)) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Файл обязателен" },
        { status: 400 },
      ),
    };
  }
  if (file.size > MAX_BYTES) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Файл больше 50 МБ" },
        { status: 400 },
      ),
    };
  }
  try {
    return { ok: true, parsed: JSON.parse(await file.text()) };
  } catch {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Файл не является JSON" },
        { status: 400 },
      ),
    };
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireDatabaseBackup();

    const payload = await readBackupPayload(req);
    if (!payload.ok) return payload.response;
    const parsed = payload.parsed;

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
