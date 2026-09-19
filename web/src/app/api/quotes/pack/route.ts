import { NextRequest, NextResponse } from "next/server";
import { jsonFileResponse, readUploadedCsv } from "@/lib/csv";
import {
  applyQuotePack,
  isDatabaseBackupKind,
  isQuotePack,
  parseQuotePack,
  collectQuotePack,
} from "@/lib/quote-backup";
import { requireManager } from "@/lib/session";

export const maxDuration = 600;

export async function GET() {
  try {
    await requireManager();
    const pack = await collectQuotePack();
    const stamp = new Date().toISOString().slice(0, 10);
    return jsonFileResponse(`quotes-${stamp}.json`, pack);
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[GET /api/quotes/pack]", e);
    return NextResponse.json(
      { error: "Не удалось экспортировать сметы" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireManager();
    const uploaded = await readUploadedCsv(req, 50 * 1024 * 1024);
    if ("error" in uploaded) return uploaded.error;
    let parsed: unknown;
    try {
      parsed = JSON.parse(uploaded.text);
    } catch {
      return NextResponse.json(
        { error: "Нужен JSON-файл экспорта смет" },
        { status: 400 },
      );
    }
    if (isDatabaseBackupKind(parsed)) {
      return NextResponse.json(
        {
          error:
            "Это файл базы CRM. Импортируйте его в разделе База, а не в списке смет.",
        },
        { status: 400 },
      );
    }
    if (!isQuotePack(parsed)) {
      return NextResponse.json(
        { error: "Это не файл экспорта смет" },
        { status: 400 },
      );
    }
    const pack = parseQuotePack(parsed);
    const result = await applyQuotePack(pack, session.user.id);
    return NextResponse.json({
      created: result.created,
      updated: result.updated,
      total: result.created + result.updated,
      errors: result.warnings.slice(0, 50),
      errorCount: result.warnings.length,
    });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[POST /api/quotes/pack]", e);
    return NextResponse.json(
      {
        error:
          e instanceof Error ? e.message : "Не удалось импортировать сметы",
      },
      { status: 400 },
    );
  }
}
