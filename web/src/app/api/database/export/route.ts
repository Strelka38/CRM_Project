import { NextResponse } from "next/server";
import { collectDatabaseBackup } from "@/lib/database-backup";
import { requireDatabaseBackup } from "@/lib/session";

export const maxDuration = 300;

export async function GET() {
  try {
    await requireDatabaseBackup();
    const backup = await collectDatabaseBackup();
    const stamp = new Date().toISOString().slice(0, 10);
    const filename = `crm-database-${stamp}.json`;
    const body = JSON.stringify(backup, null, 2);

    return new NextResponse(body, {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[GET /api/database/export]", e);
    return NextResponse.json(
      { error: "Не удалось экспортировать базу" },
      { status: 500 },
    );
  }
}
