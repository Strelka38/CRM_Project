import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { canAccessQuote } from "@/lib/quote-access";
import { applySpecImport, previewSpecImport } from "@/lib/spec-import";
import { requireSpecEditor } from "@/lib/session";

const bodySchema = z.object({
  apply: z.boolean().optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireSpecEditor();
    const { id } = await params;
    const ok = await canAccessQuote(id, session.user.id, session.user.role);
    if (!ok) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const body = bodySchema.parse(await req.json().catch(() => ({})));
    const result = body.apply
      ? await applySpecImport(id, session.user.id)
      : await previewSpecImport(id);
    if (!result) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof Response) return e;
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.flatten() }, { status: 400 });
    }
    console.error("POST /api/quotes/[id]/spec/import", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Не удалось импортировать" },
      { status: 500 },
    );
  }
}
