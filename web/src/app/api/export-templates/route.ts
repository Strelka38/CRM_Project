import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  EXPORT_TEMPLATES_KEY,
  parseExportTemplateSettings,
  parseExportTemplates,
  templateNameError,
  type ExportTemplate,
} from "@/lib/export/export-templates";
import { requireManager } from "@/lib/session";

async function readTemplates(): Promise<ExportTemplate[]> {
  const row = await prisma.appSetting.findUnique({
    where: { key: EXPORT_TEMPLATES_KEY },
  });
  return parseExportTemplates(row?.value ?? "[]");
}

export async function GET() {
  try {
    await requireManager();
    return NextResponse.json({ templates: await readTemplates() });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("[GET /api/export-templates]", error);
    return NextResponse.json({ error: "Не удалось загрузить шаблоны" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireManager();
    const body: unknown = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Некорректные данные" }, { status: 400 });
    }
    const rec = body as Record<string, unknown>;
    const name = typeof rec.name === "string" ? rec.name.trim() : "";
    const settings = parseExportTemplateSettings(rec.settings);

    const saved = await prisma.$transaction(async (tx) => {
      const row = await tx.appSetting.findUnique({
        where: { key: EXPORT_TEMPLATES_KEY },
      });
      const list = parseExportTemplates(row?.value ?? "[]");
      const error = templateNameError(name, list);
      if (error) return { error } as const;
      const template: ExportTemplate = { id: randomUUID(), name, settings };
      const templates = [...list, template];
      const value = JSON.stringify(templates);
      await tx.appSetting.upsert({
        where: { key: EXPORT_TEMPLATES_KEY },
        create: { key: EXPORT_TEMPLATES_KEY, value },
        update: { value },
      });
      return { template, templates } as const;
    });

    if ("error" in saved) {
      return NextResponse.json({ error: saved.error }, { status: 400 });
    }
    return NextResponse.json(saved);
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("[POST /api/export-templates]", error);
    return NextResponse.json({ error: "Не удалось сохранить шаблон" }, { status: 500 });
  }
}
