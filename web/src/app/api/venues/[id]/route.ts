import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireManager } from "@/lib/session";

const venueSelect = {
  id: true,
  name: true,
  address: true,
  mapUrl: true,
  comment: true,
  active: true,
  createdAt: true,
  updatedAt: true,
  photos: {
    orderBy: [{ sortOrder: "asc" as const }, { createdAt: "asc" as const }],
    select: {
      id: true,
      filename: true,
      mimeType: true,
      size: true,
      sortOrder: true,
      createdAt: true,
    },
  },
  _count: { select: { quotes: true } },
};

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireManager();
    const { id } = await params;

    const venue = await prisma.venue.findUnique({
      where: { id },
      select: venueSelect,
    });
    if (!venue) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const quotes = await prisma.quote.findMany({
      where: { venueId: id },
      orderBy: [{ eventDate: "desc" }, { createdAt: "desc" }],
      select: {
        id: true,
        proposalNumber: true,
        eventName: true,
        date: true,
        lifecycle: true,
        client: true,
      },
    });

    return NextResponse.json({ ...venue, quotes });
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  address: z.string().optional(),
  mapUrl: z.string().optional(),
  comment: z.string().optional(),
  active: z.boolean().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireManager();
    const { id } = await params;
    const body = patchSchema.parse(await req.json());

    const existing = await prisma.venue.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const data: Record<string, unknown> = {};
    if (body.name !== undefined) data.name = body.name.trim();
    if (body.address !== undefined) data.address = body.address.trim();
    if (body.mapUrl !== undefined) data.mapUrl = body.mapUrl.trim();
    if (body.comment !== undefined) data.comment = body.comment.trim();
    if (body.active !== undefined) data.active = body.active;

    const venue = await prisma.venue.update({
      where: { id },
      data,
      select: venueSelect,
    });

    // Keep denormalized Quote.place in sync when venue name changes
    if (body.name !== undefined && body.name.trim() !== existing.name) {
      await prisma.quote.updateMany({
        where: { venueId: id },
        data: { place: body.name.trim() },
      });
    }

    return NextResponse.json(venue);
  } catch (e) {
    if (e instanceof Response) return e;
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.flatten() }, { status: 400 });
    }
    throw e;
  }
}
