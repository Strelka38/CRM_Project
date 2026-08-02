import { NextRequest, NextResponse } from "next/server";
import { parseEventDate } from "@/lib/dates";
import { requireSession } from "@/lib/session";
import {
  getAvailability,
  getReservationDetails,
} from "@/lib/stock";

export async function GET(req: NextRequest) {
  try {
    await requireSession();
    const idsParam = req.nextUrl.searchParams.get("ids") || "";
    const ids = [
      ...new Set(
        idsParam
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      ),
    ].slice(0, 80);

    const eventDate = parseEventDate(
      req.nextUrl.searchParams.get("eventDate") || undefined,
    );
    const durationDays = Math.max(
      1,
      Number(req.nextUrl.searchParams.get("days") || 1) || 1,
    );
    const excludeQuoteId =
      req.nextUrl.searchParams.get("excludeQuoteId") || undefined;

    if (ids.length === 0) {
      return NextResponse.json({});
    }

    const entries = await Promise.all(
      ids.map(async (id) => {
        const av = await getAvailability(
          id,
          eventDate,
          durationDays,
          excludeQuoteId,
        );
        if (!av) return [id, null] as const;
        const reservations = av.unlimited
          ? []
          : await getReservationDetails(
              id,
              eventDate,
              durationDays,
              excludeQuoteId,
            );
        return [
          id,
          {
            catalogItemId: id,
            name: av.name,
            stockQty: av.stockQty,
            reserved: av.reserved,
            available: av.available,
            unlimited: av.unlimited,
            reservations,
          },
        ] as const;
      }),
    );

    return NextResponse.json(Object.fromEntries(entries));
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}
