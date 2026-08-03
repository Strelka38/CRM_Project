import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireDatabaseAccess } from "@/lib/session";

const venueSelect = {
  id: true,
  name: true,
  address: true,
  mapUrl: true,
  comment: true,
  active: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { quotes: true, photos: true } },
} as const;

export async function GET(req: NextRequest) {
  try {
    await requireDatabaseAccess();
    const q = req.nextUrl.searchParams.get("q")?.trim();
    const activeOnly = req.nextUrl.searchParams.get("active") !== "0";

    const venues = await prisma.venue.findMany({
      where: {
        ...(activeOnly ? { active: true } : {}),
        ...(q
          ? {
              OR: [
                { name: { contains: q, mode: "insensitive" } },
                { address: { contains: q, mode: "insensitive" } },
                { comment: { contains: q, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      orderBy: { name: "asc" },
      select: venueSelect,
      take: q ? 20 : 500,
    });
    return NextResponse.json(venues);
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("GET /api/venues", e);
    return NextResponse.json(
      { error: "Не удалось загрузить площадки" },
      { status: 500 },
    );
  }
}

const createSchema = z.object({
  name: z.string().min(1),
  address: z.string().optional(),
  mapUrl: z.string().optional(),
  comment: z.string().optional(),
  active: z.boolean().optional(),
});

export async function POST(req: NextRequest) {
  try {
    await requireDatabaseAccess();
    const body = createSchema.parse(await req.json());
    const venue = await prisma.venue.create({
      data: {
        name: body.name.trim(),
        address: body.address?.trim() || "",
        mapUrl: body.mapUrl?.trim() || "",
        comment: body.comment?.trim() || "",
        active: body.active ?? true,
      },
      select: venueSelect,
    });
    return NextResponse.json(venue, { status: 201 });
  } catch (e) {
    if (e instanceof Response) return e;
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.flatten() }, { status: 400 });
    }
    console.error("POST /api/venues", e);
    return NextResponse.json(
      { error: "Не удалось создать площадку" },
      { status: 500 },
    );
  }
}
