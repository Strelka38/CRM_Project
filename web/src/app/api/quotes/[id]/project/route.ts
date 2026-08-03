import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { canAccessQuote } from "@/lib/quote-access";
import { requireManager, requireSession } from "@/lib/session";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireSession();
    const { id } = await params;
    const ok = await canAccessQuote(id, session.user.id, session.user.role);
    if (!ok) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const quote = await prisma.quote.findUnique({
      where: { id },
      select: {
        id: true,
        proposalNumber: true,
        eventName: true,
        date: true,
        eventDate: true,
        mountDate: true,
        demountDate: true,
        time: true,
        place: true,
        client: true,
        managerName: true,
        brief: true,
        lifecycle: true,
        durationDays: true,
        owner: {
          select: {
            id: true,
            name: true,
            firstName: true,
            lastName: true,
          },
        },
        assignments: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                firstName: true,
                lastName: true,
              },
            },
            specialty: { select: { id: true, name: true } },
          },
          orderBy: { createdAt: "asc" },
        },
        _count: {
          select: { comments: true, attachments: true },
        },
      },
    });
    if (!quote) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({
      ...quote,
      isManager: session.user.role === "MANAGER",
    });
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}

const patchSchema = z.object({
  brief: z.string().max(8000),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireManager();
    const { id } = await params;
    const ok = await canAccessQuote(id, session.user.id, session.user.role);
    if (!ok) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const body = patchSchema.parse(await req.json());
    const quote = await prisma.quote.update({
      where: { id },
      data: { brief: body.brief },
      select: { id: true, brief: true },
    });
    return NextResponse.json(quote);
  } catch (e) {
    if (e instanceof Response) return e;
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.flatten() }, { status: 400 });
    }
    throw e;
  }
}
