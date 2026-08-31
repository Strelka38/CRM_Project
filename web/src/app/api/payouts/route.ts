import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { formatYearMonthLabel, parseYearMonth } from "@/lib/period";
import {
  buildPayoutBoard,
  ensurePayoutsSchemaOnce,
  setPayoutsPaid,
} from "@/lib/payouts-server";
import { requirePaymentsAccess } from "@/lib/session";

export async function GET(req: NextRequest) {
  try {
    await requirePaymentsAccess();
    await ensurePayoutsSchemaOnce();
    const userId = req.nextUrl.searchParams.get("userId") || "";
    const board = await buildPayoutBoard({
      userId: userId || undefined,
    });
    const previous = parseYearMonth(board.previousYm);
    return NextResponse.json({
      previousYm: board.previousYm,
      previousLabel: formatYearMonthLabel(previous),
      queue: {
        staff: board.staffQueue,
        freelancers: board.freelancerQueue,
        staffTotal: board.staffTotal,
        freelancerTotal: board.freelancerTotal,
        total: board.total,
      },
      history: board.history,
      historyTotal: board.historyTotal,
    });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("GET /api/payouts", e);
    return NextResponse.json(
      { error: "Не удалось загрузить оплаты" },
      { status: 500 },
    );
  }
}

const patchSchema = z.object({
  sourceKeys: z.array(z.string().min(1)).min(1).max(200),
  paid: z.boolean(),
});

export async function PATCH(req: NextRequest) {
  try {
    const session = await requirePaymentsAccess();
    await ensurePayoutsSchemaOnce();
    const body = patchSchema.parse(await req.json());
    const results = await setPayoutsPaid({
      sourceKeys: body.sourceKeys,
      paid: body.paid,
      actorId: session.user.id,
    });
    const failed = results.filter((r) => !r.ok);
    return NextResponse.json({
      ok: failed.length === 0,
      results,
      error: failed[0]?.error,
    });
  } catch (e) {
    if (e instanceof Response) return e;
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.flatten() }, { status: 400 });
    }
    console.error("PATCH /api/payouts", e);
    return NextResponse.json(
      { error: "Не удалось сохранить оплаты" },
      { status: 500 },
    );
  }
}
