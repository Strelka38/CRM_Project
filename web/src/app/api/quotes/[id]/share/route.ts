import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ensureQuoteSchemaColumns } from "@/lib/ensure-schema";
import { getAccessibleQuote } from "@/lib/quote-access";
import {
  newShareToken,
  publicQuotePath,
  readShareFilters,
  shareClearedByLifecycle,
} from "@/lib/quote-share";
import { requireManager } from "@/lib/session";

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

async function loadQuote(id: string, userId: string, role: string) {
  await ensureSchemaOnce();
  return getAccessibleQuote(id, userId, role);
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireManager();
    const { id } = await params;
    const quote = await loadQuote(id, session.user.id, session.user.role);
    if (!quote) {
      return NextResponse.json({ error: "Смета не найдена" }, { status: 404 });
    }
    const share = await prisma.quoteShare.findUnique({
      where: { quoteId: id },
      select: { token: true },
    });
    if (!share || shareClearedByLifecycle(quote.lifecycle)) {
      if (share) {
        await prisma.quoteShare.deleteMany({ where: { quoteId: id } });
      }
      return NextResponse.json({ path: null });
    }
    return NextResponse.json({ path: publicQuotePath(share.token) });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("[GET /api/quotes/:id/share]", error);
    return NextResponse.json({ error: "Не удалось прочитать ссылку" }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireManager();
    const { id } = await params;
    const quote = await loadQuote(id, session.user.id, session.user.role);
    if (!quote) {
      return NextResponse.json({ error: "Смета не найдена" }, { status: 404 });
    }
    if (shareClearedByLifecycle(quote.lifecycle)) {
      await prisma.quoteShare.deleteMany({ where: { quoteId: id } });
      return NextResponse.json(
        { error: "Мероприятие завершено, ссылка недоступна" },
        { status: 409 },
      );
    }
    const body: unknown = await req.json().catch(() => null);
    const zoneIds = quote.zones.map((zone) => zone.id);
    const filters = readShareFilters(body, zoneIds);
    if (!filters) {
      return NextResponse.json(
        { error: "Выберите хотя бы одну зону" },
        { status: 400 },
      );
    }

    const existing = await prisma.quoteShare.findUnique({
      where: { quoteId: id },
      select: { token: true },
    });
    const token = existing?.token ?? newShareToken();
    await prisma.quoteShare.upsert({
      where: { quoteId: id },
      create: {
        quoteId: id,
        token,
        filters: filters as Prisma.InputJsonValue,
      },
      update: { filters: filters as Prisma.InputJsonValue },
    });
    return NextResponse.json({ path: publicQuotePath(token) });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("[POST /api/quotes/:id/share]", error);
    return NextResponse.json({ error: "Не удалось создать ссылку" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireManager();
    const { id } = await params;
    const quote = await loadQuote(id, session.user.id, session.user.role);
    if (!quote) {
      return NextResponse.json({ error: "Смета не найдена" }, { status: 404 });
    }
    await prisma.quoteShare.deleteMany({ where: { quoteId: id } });
    return NextResponse.json({ path: null });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("[DELETE /api/quotes/:id/share]", error);
    return NextResponse.json({ error: "Не удалось удалить ссылку" }, { status: 500 });
  }
}
