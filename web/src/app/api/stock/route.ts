import { NextRequest, NextResponse } from "next/server";
import { parseEventDate } from "@/lib/dates";
import { requireSession } from "@/lib/session";
import {
  getAvailability,
  getReservationDetails,
  type StockSchedule,
} from "@/lib/stock";

function scheduleFromSearch(sp: URLSearchParams): StockSchedule {
  const eventDateRaw = sp.get("eventDate") || "";
  return {
    date: eventDateRaw,
    eventDate: parseEventDate(eventDateRaw || undefined),
    durationDays: Math.max(1, Number(sp.get("days") || 1) || 1),
    mountDate: sp.get("mountDate") || "",
    mountDurationDays: Math.max(1, Number(sp.get("mountDays") || 1) || 1),
    demountDate: sp.get("demountDate") || "",
    demountDurationDays: Math.max(1, Number(sp.get("demountDays") || 1) || 1),
  };
}

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

    const schedule = scheduleFromSearch(req.nextUrl.searchParams);
    const excludeQuoteId =
      req.nextUrl.searchParams.get("excludeQuoteId") || undefined;

    if (ids.length === 0) {
      return NextResponse.json({});
    }

    const entries = await Promise.all(
      ids.map(async (id) => {
        const av = await getAvailability(id, schedule, excludeQuoteId);
        if (!av) return [id, null] as const;
        const reservations = av.unlimited
          ? []
          : await getReservationDetails(id, schedule, excludeQuoteId);
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
