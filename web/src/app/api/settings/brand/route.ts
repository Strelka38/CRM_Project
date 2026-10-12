import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  clearBrandLogo,
  getBrandLogoPath,
  getBrandSettings,
  saveBrandLogoPath,
  saveBrandText,
} from "@/lib/brand-settings";
import { requireAdmin } from "@/lib/session";
import {
  deleteUploadFile,
  resolveUploadMime,
  saveBrandLogo,
} from "@/lib/uploads";

const TEXT = new Set(["image/png", "image/jpeg", "image/webp"]);
const MAX_LOGO = 2 * 1024 * 1024;

const textSchema = z.object({
  crmName: z.string().optional(),
  kpName: z.string().optional(),
  kpSite: z.string().optional(),
  kpLogoInvert: z.boolean().optional(),
});

export async function GET() {
  try {
    await requireAdmin();
    return NextResponse.json(await getBrandSettings());
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}

export async function PATCH(req: NextRequest) {
  try {
    await requireAdmin();
    const body = textSchema.parse(await req.json());
    const brand = await saveBrandText(body);
    return NextResponse.json(brand);
  } catch (e) {
    if (e instanceof Response) return e;
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: "Проверьте поля" }, { status: 400 });
    }
    throw e;
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireAdmin();
    const form = await req.formData();
    const kind = form.get("kind");
    if (kind !== "crm" && kind !== "kp") {
      return NextResponse.json({ error: "Неизвестный логотип" }, { status: 400 });
    }
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Файл обязателен" }, { status: 400 });
    }
    const mimeType = resolveUploadMime(file);
    if (!mimeType || !TEXT.has(mimeType)) {
      return NextResponse.json(
        { error: "Допустимы PNG, JPG и WebP" },
        { status: 400 },
      );
    }
    if (file.size > MAX_LOGO) {
      return NextResponse.json({ error: "Файл больше 2 МБ" }, { status: 400 });
    }
    const prev = await getBrandLogoPath(kind);
    const buf = Buffer.from(await file.arrayBuffer());
    const { storagePath } = await saveBrandLogo(kind, mimeType, buf);
    const brand = await saveBrandLogoPath(kind, storagePath);
    if (prev) await deleteUploadFile(prev);
    return NextResponse.json(brand);
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}

export async function DELETE(req: NextRequest) {
  try {
    await requireAdmin();
    const kind = req.nextUrl.searchParams.get("kind");
    if (kind !== "crm" && kind !== "kp") {
      return NextResponse.json({ error: "Неизвестный логотип" }, { status: 400 });
    }
    const prev = await getBrandLogoPath(kind);
    const brand = await clearBrandLogo(kind);
    if (prev) await deleteUploadFile(prev);
    return NextResponse.json(brand);
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}
