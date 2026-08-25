import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  applyRosterAssignUser,
  applyRosterShiftToDay,
  applyRosterSwap,
  applyRosterUnassign,
  rosterErrorStatus,
  type RosterSlotRef,
} from "@/lib/roster-server";
import { requireAssignmentManager } from "@/lib/session";

const slotSchema = z.object({
  source: z.enum(["quote", "entry"]),
  quoteId: z.string().min(1).nullable().optional(),
  entryId: z.string().min(1).nullable().optional(),
  assignmentIds: z.array(z.string().min(1)).default([]),
  userId: z.string().min(1).nullable().optional(),
  entryRole: z.enum(["assignee", "responsible", "vacant"]).optional(),
  dayIndexStart: z.number().int().min(1).nullable().optional(),
  dayIndexEnd: z.number().int().min(1).nullable().optional(),
  eventDays: z.number().int().min(1).nullable().optional(),
  mountDuty: z.enum(["mount", "demount"]).nullable().optional(),
});

const bodySchema = z.object({
  source: z.discriminatedUnion("type", [
    z.object({ type: z.literal("user"), userId: z.string().min(1) }),
    z.object({ type: z.literal("slot"), slot: slotSchema }),
  ]),
  target: z.discriminatedUnion("type", [
    z.object({ type: z.literal("slot"), slot: slotSchema }),
    z.object({ type: z.literal("day"), dateKey: z.string().min(1) }),
    z.object({ type: z.literal("unassign") }),
  ]),
  forcePast: z.boolean().optional(),
});

export async function POST(req: NextRequest) {
  try {
    await requireAssignmentManager();
    const body = bodySchema.parse(await req.json());

    const forcePast = Boolean(body.forcePast);

    if (body.source.type === "user" && body.target.type === "slot") {
      await applyRosterAssignUser(
        body.target.slot as RosterSlotRef,
        body.source.userId,
        forcePast,
      );
      return NextResponse.json({ ok: true });
    }

    if (body.source.type === "slot" && body.target.type === "slot") {
      await applyRosterSwap(
        body.source.slot as RosterSlotRef,
        body.target.slot as RosterSlotRef,
        forcePast,
      );
      return NextResponse.json({ ok: true });
    }

    if (body.source.type === "slot" && body.target.type === "unassign") {
      await applyRosterUnassign(body.source.slot as RosterSlotRef, forcePast);
      return NextResponse.json({ ok: true });
    }

    if (body.source.type === "slot" && body.target.type === "day") {
      await applyRosterShiftToDay(
        body.source.slot as RosterSlotRef,
        body.target.dateKey,
        forcePast,
      );
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json(
      { error: "Так перенести нельзя" },
      { status: 400 },
    );
  } catch (e) {
    if (e instanceof Response) return e;
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.flatten() }, { status: 400 });
    }
    const { status, error } = rosterErrorStatus(e);
    return NextResponse.json({ error }, { status });
  }
}
