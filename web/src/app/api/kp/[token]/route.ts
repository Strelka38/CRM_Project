import { NextRequest, NextResponse } from "next/server";
import { ensureQuoteSchemaColumns } from "@/lib/ensure-schema";
import { renderPublicQuoteHtml } from "@/lib/quote-share-view";

export const dynamic = "force-dynamic";

let ensureOnce: Promise<void> | null = null;

function ensureSchemaOnce() {
  if (!ensureOnce) {
    ensureOnce = ensureQuoteSchemaColumns().catch((error) => {
      ensureOnce = null;
      throw error;
    });
  }
  return ensureOnce;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  try {
    await ensureSchemaOnce();
    const rendered = await renderPublicQuoteHtml(token, req.nextUrl.origin);
    if (!rendered) {
      return NextResponse.json(
        { error: "Ссылка недействительна" },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    }
    return new NextResponse(rendered.html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Robots-Tag": "noindex, nofollow",
      },
    });
  } catch (error) {
    console.error("[GET /api/kp/:token]", error);
    return NextResponse.json(
      { error: "Не удалось открыть предложение" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
