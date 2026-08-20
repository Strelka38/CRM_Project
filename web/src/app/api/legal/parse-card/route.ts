import { NextRequest, NextResponse } from "next/server";
import { extractCardText, isCardFilename } from "@/lib/legal-card-extract";
import { parseEnterpriseCard } from "@/lib/legal-card-parse";
import { requireDatabaseAccess } from "@/lib/session";

export async function POST(req: NextRequest) {
  try {
    await requireDatabaseAccess();
    const ctype = req.headers.get("content-type") || "";
    let text = "";
    let filename = "";

    if (ctype.includes("multipart/form-data")) {
      const form = await req.formData();
      const pasted = form.get("text");
      if (typeof pasted === "string" && pasted.trim()) {
        text = pasted;
      }
      const file = form.get("file");
      if (file instanceof File) {
        filename = file.name || "";
        if (!isCardFilename(filename) && file.type && !file.type.startsWith("text/")) {
          return NextResponse.json(
            { error: "Нужен файл .txt, .rtf, .doc или .docx" },
            { status: 400 },
          );
        }
        const buf = Buffer.from(await file.arrayBuffer());
        text = extractCardText(buf, filename);
      }
    } else {
      const body = (await req.json().catch(() => ({}))) as { text?: string };
      text = typeof body.text === "string" ? body.text : "";
    }

    if (!text.trim()) {
      return NextResponse.json(
        { error: "Вставьте текст карточки или загрузите файл" },
        { status: 400 },
      );
    }

    const parsed = parseEnterpriseCard(text);
    return NextResponse.json({
      ...parsed,
      rawText: text.slice(0, 20_000),
      filename,
    });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("POST /api/legal/parse-card", e);
    return NextResponse.json(
      { error: "Не удалось разобрать карточку" },
      { status: 500 },
    );
  }
}
