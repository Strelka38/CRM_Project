import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { applyRosterSpan, rosterErrorStatus } from "@/lib/roster-server";
import { requireAssignmentManager } from "@/lib/session";

const bodySchema = z.object({
  quoteId: z.string().min(1),
  assignmentIds: z.array(z.string().min(1)).min(1),
  fromDay: z.number().int().min(1),
  toDay: z.number().int().min(1),
  forcePast: z.boolean().optional(),
});

export async function POST(req: NextRequest) {
  try {
    await requireAssignmentManager();
    const body = bodySchema.parse(await req.json());
    await applyRosterSpan(body);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof Response) return e;
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.flatten() }, { status: 400 });
    }
    const { status, error } = rosterErrorStatus(e);
    return NextResponse.json({ error }, { status });
  }
}
