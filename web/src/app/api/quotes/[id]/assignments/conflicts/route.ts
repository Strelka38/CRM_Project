import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  calendarBusyOverlappingQuote,
  dayOffsOverlappingQuote,
} from "@/lib/day-off-conflicts";
import {
  dateRangesOverlap,
  overlapDateLabels,
  quoteOccupancyRange,
} from "@/lib/quote-schedule";
import { requireAssignmentManager } from "@/lib/session";

/**
 * GET ?userId=… — conflicts if the employee is on another event, day-off,
 * rental (responsible) or task (assignee) overlapping this quote's dates.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAssignmentManager();
    const { id } = await params;
    const userId = req.nextUrl.searchParams.get("userId")?.trim();
    if (!userId) {
      return NextResponse.json(
        { error: "userId required" },
        { status: 400 },
      );
    }

    const quote = await prisma.quote.findUnique({
      where: { id },
      select: {
        id: true,
        date: true,
        eventDate: true,
        durationDays: true,
        mountDate: true,
        mountDurationDays: true,
        demountDate: true,
        demountDurationDays: true,
      },
    });
    if (!quote) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const targetRange = quoteOccupancyRange(quote);
    if (!targetRange) {
      return NextResponse.json({
        conflicts: [],
        dayOffs: [],
        calendarBusy: [],
      });
    }

    const otherAssignments = await prisma.quoteAssignment.findMany({
      where: {
        userId,
        isFreelancer: false,
        quoteId: { not: id },
        quote: {
          lifecycle: { not: "CANCELLED" },
        },
      },
      select: {
        quote: {
          select: {
            id: true,
            proposalNumber: true,
            eventName: true,
            client: true,
            date: true,
            eventDate: true,
            durationDays: true,
            mountDate: true,
            mountDurationDays: true,
            demountDate: true,
            demountDurationDays: true,
          },
        },
      },
    });

    const conflicts: Array<{
      quoteId: string;
      proposalNumber: string;
      eventName: string;
      overlapDates: string[];
    }> = [];

    const seen = new Set<string>();
    for (const a of otherAssignments) {
      if (seen.has(a.quote.id)) continue;
      const range = quoteOccupancyRange(a.quote);
      if (!range || !dateRangesOverlap(targetRange, range)) continue;
      const overlapDates = overlapDateLabels(targetRange, range);
      if (overlapDates.length === 0) continue;
      seen.add(a.quote.id);
      conflicts.push({
        quoteId: a.quote.id,
        proposalNumber: a.quote.proposalNumber,
        eventName: a.quote.eventName || a.quote.client || "",
        overlapDates,
      });
    }

    conflicts.sort((a, b) =>
      (a.overlapDates[0] || "").localeCompare(b.overlapDates[0] || "", "ru"),
    );

    const [dayOffs, calendarBusy] = await Promise.all([
      dayOffsOverlappingQuote(userId, quote),
      calendarBusyOverlappingQuote(userId, quote),
    ]);

    return NextResponse.json({ conflicts, dayOffs, calendarBusy });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("GET /api/quotes/[id]/assignments/conflicts", e);
    return NextResponse.json(
      { error: "Не удалось проверить занятость" },
      { status: 500 },
    );
  }
}
