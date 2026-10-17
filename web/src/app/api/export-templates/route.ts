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
import { getOrgSettings } from "@/lib/org-settings";
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
    const [templates, org] = await Promise.all([readTemplates(), getOrgSettings()]);
    return NextResponse.json({
      templates,
      defaultTemplateId: org.kpDefaultTemplateId,
    });
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
    const comment = typeof rec.comment === "string" ? rec.comment.trim().slice(0, 200) : "";
    const note = typeof rec.note === "string" ? rec.note.trim().slice(0, 4000) : "";
    const settings = parseExportTemplateSettings(rec.settings);

    const saved = await prisma.$transaction(async (tx) => {
      const row = await tx.appSetting.findUnique({
        where: { key: EXPORT_TEMPLATES_KEY },
      });
      const list = parseExportTemplates(row?.value ?? "[]");
      const error = templateNameError(name, list);
      if (error) return { error } as const;
      const template: ExportTemplate = { id: randomUUID(), name, comment, note, settings };
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

async function writeTemplates(templates: ExportTemplate[]) {
  const value = JSON.stringify(templates);
  await prisma.appSetting.upsert({
    where: { key: EXPORT_TEMPLATES_KEY },
    create: { key: EXPORT_TEMPLATES_KEY, value },
    update: { value },
  });
}

export async function PATCH(req: NextRequest) {
  try {
    await requireManager();
    const body: unknown = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Некорректные данные" }, { status: 400 });
    }
    const rec = body as Record<string, unknown>;
    const id = typeof rec.id === "string" ? rec.id.trim() : "";
    if (!id || id === "standard") {
      return NextResponse.json({ error: "Этот шаблон нельзя изменить так" }, { status: 400 });
    }
    const list = await readTemplates();
    const current = list.find((item) => item.id === id);
    if (!current) {
      return NextResponse.json({ error: "Шаблон не найден" }, { status: 404 });
    }
    const name = typeof rec.name === "string" ? rec.name.trim() : current.name;
    const error = templateNameError(
      name,
      list.filter((item) => item.id !== id),
    );
    if (error) return NextResponse.json({ error }, { status: 400 });
    const comment =
      typeof rec.comment === "string" ? rec.comment.trim().slice(0, 200) : current.comment;
    const note = typeof rec.note === "string" ? rec.note.trim().slice(0, 4000) : current.note;
    const settings =
      rec.settings && typeof rec.settings === "object"
        ? parseExportTemplateSettings(rec.settings)
        : current.settings;
    const templates = list.map((item) =>
      item.id === id ? { ...item, name, comment, note, settings } : item,
    );
    await writeTemplates(templates);
    return NextResponse.json({ templates });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("[PATCH /api/export-templates]", error);
    return NextResponse.json({ error: "Не удалось сохранить шаблон" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    await requireManager();
    const id = req.nextUrl.searchParams.get("id")?.trim() || "";
    if (!id || id === "standard") {
      return NextResponse.json({ error: "Этот шаблон нельзя удалить" }, { status: 400 });
    }
    const templates = (await readTemplates()).filter((item) => item.id !== id);
    await writeTemplates(templates);
    return NextResponse.json({ templates });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("[DELETE /api/export-templates]", error);
    return NextResponse.json({ error: "Не удалось удалить шаблон" }, { status: 500 });
  }
}
