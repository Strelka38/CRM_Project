import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import {
  freelancerAssignmentPay,
  findFreelancerByName,
  normalizeFreelancerName,
  quoteCountsForFreelancerStats,
} from "@/lib/freelancer-directory";
import { canSeeAssignmentPay, requireDatabaseAccess } from "@/lib/session";

const freelancerSelect = {
  id: true,
  name: true,
  comment: true,
  active: true,
  createdAt: true,
  updatedAt: true,
  specialties: {
    select: {
      specialtyId: true,
      hourlyRate: true,
      shiftRate: true,
      specialty: { select: { id: true, name: true } },
    },
    orderBy: { specialty: { sortOrder: "asc" as const } },
  },
} as const;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireDatabaseAccess();
    const { id } = await params;
    const showPay = canSeeAssignmentPay(session.user.role);

    const freelancer = await prisma.freelancer.findUnique({
      where: { id },
      select: freelancerSelect,
    });
    if (!freelancer) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const assignments = await prisma.quoteAssignment.findMany({
      where: {
        isFreelancer: true,
        freelancerName: { equals: freelancer.name, mode: "insensitive" },
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        kind: true,
        payMode: true,
        hours: true,
        rateOverride: true,
        bonus: true,
        montageAmount: true,
        specialty: { select: { name: true } },
        quote: {
          select: {
            id: true,
            proposalNumber: true,
            eventName: true,
            date: true,
            lifecycle: true,
          },
        },
      },
    });

    let payoutMarks: Array<{ assignmentId: string | null; amount: number }> = [];
    try {
      payoutMarks = await prisma.payout.findMany({
        where: {
          kind: "FREELANCER_EVENT",
          paid: true,
          payeeName: { equals: freelancer.name, mode: "insensitive" },
        },
        select: { assignmentId: true, amount: true },
      });
    } catch {
      payoutMarks = [];
    }
    const paidByAssignment = new Set(
      payoutMarks.map((m) => m.assignmentId).filter(Boolean) as string[],
    );

    const payouts = assignments.map((a) => {
      const pay = freelancerAssignmentPay(a);
      const countsForStats = quoteCountsForFreelancerStats(a.quote.lifecycle);
      const paid = paidByAssignment.has(a.id);
      return {
        assignmentId: a.id,
        quoteId: a.quote.id,
        proposalNumber: a.quote.proposalNumber,
        eventName: a.quote.eventName,
        date: a.quote.date,
        lifecycle: a.quote.lifecycle,
        paid,
        kind: a.kind,
        specialtyName: a.specialty.name,
        pay: showPay ? pay : 0,
        countsForStats,
      };
    });

    const statsRows = payouts.filter((p) => p.countsForStats);
    const quoteIds = new Set(statsRows.map((p) => p.quoteId));
    const totalPay = statsRows.reduce((s, p) => s + p.pay, 0);
    const paidPay = showPay
      ? payoutMarks.reduce((s, m) => s + Math.max(0, Number(m.amount) || 0), 0)
      : 0;

    return NextResponse.json({
      ...freelancer,
      stats: {
        assignmentCount: assignments.length,
        eventCount: new Set(payouts.map((p) => p.quoteId)).size,
        confirmedEventCount: quoteIds.size,
        totalPay,
        paidPay,
        showPay,
      },
      payouts,
    });
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}

function blankToUndef(value: unknown) {
  if (typeof value !== "string") return value;
  const t = value.trim();
  return t.length > 0 ? t : undefined;
}

const patchSchema = z.object({
  name: z.preprocess(blankToUndef, z.string().min(1).optional()),
  comment: z.string().optional(),
  active: z.boolean().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireDatabaseAccess();
    const { id } = await params;
    const body = patchSchema.parse(await req.json());

    const existing = await prisma.freelancer.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const data: { name?: string; comment?: string; active?: boolean } = {};
    if (body.name !== undefined) {
      const name = normalizeFreelancerName(body.name);
      if (!name) {
        return NextResponse.json({ error: "Укажите ФИО" }, { status: 400 });
      }
      const duplicate = await findFreelancerByName(prisma, name);
      if (duplicate && duplicate.id !== id) {
        return NextResponse.json(
          { error: "Фрилансер с таким ФИО уже есть" },
          { status: 409 },
        );
      }
      data.name = name;
    }
    if (body.comment !== undefined) data.comment = body.comment.trim();
    if (body.active !== undefined) data.active = body.active;

    const freelancer = await prisma.freelancer.update({
      where: { id },
      data,
      select: freelancerSelect,
    });

    if (data.name && data.name !== existing.name) {
      await prisma.quoteAssignment.updateMany({
        where: {
          isFreelancer: true,
          freelancerName: { equals: existing.name, mode: "insensitive" },
        },
        data: { freelancerName: data.name },
      });
    }

    return NextResponse.json(freelancer);
  } catch (e) {
    if (e instanceof Response) return e;
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.flatten() }, { status: 400 });
    }
    throw e;
  }
}
