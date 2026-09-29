import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { ensureQuoteSchemaColumns } from "@/lib/ensure-schema";
import {
  accumulateFreelancerPay,
  emptyFreelancerPayAgg,
  ensureFreelancerByName,
  freelancerAssignmentPay,
  freelancerNameKey,
  findFreelancerByName,
  normalizeFreelancerName,
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

let ensureOnce: Promise<void> | null = null;

function ensureSchemaOnce() {
  if (!ensureOnce) {
    ensureOnce = ensureQuoteSchemaColumns().catch((e) => {
      ensureOnce = null;
      throw e;
    });
  }
  return ensureOnce;
}

async function backfillFromAssignments() {
  const names = await prisma.quoteAssignment.findMany({
    where: { isFreelancer: true, freelancerName: { not: "" } },
    distinct: ["freelancerName"],
    select: { freelancerName: true },
  });
  for (const row of names) {
    await ensureFreelancerByName(row.freelancerName);
  }
}

async function payByNameKey() {
  const rows = await prisma.quoteAssignment.findMany({
    where: { isFreelancer: true, freelancerName: { not: "" } },
    select: {
      quoteId: true,
      freelancerName: true,
      payMode: true,
      hours: true,
      rateOverride: true,
      bonus: true,
      montageAmount: true,
        quote: { select: { lifecycle: true } },
    },
  });
  const map = new Map<
    string,
    ReturnType<typeof emptyFreelancerPayAgg> & { quoteIds: Set<string> }
  >();
  for (const row of rows) {
    accumulateFreelancerPay(map, row.freelancerName, {
      quoteId: row.quoteId,
      lifecycle: row.quote.lifecycle,
      paid: false,
      pay: freelancerAssignmentPay(row),
    });
  }
  return map;
}

export async function GET(req: NextRequest) {
  try {
    const session = await requireDatabaseAccess();
    await ensureSchemaOnce();
    const q = req.nextUrl.searchParams.get("q")?.trim();
    const suggest = req.nextUrl.searchParams.get("suggest") === "1";
    const activeOnly = req.nextUrl.searchParams.get("active") !== "0";
    const showPay = canSeeAssignmentPay(session.user.role, session.permissions);

    if (!q && !suggest) {
      await backfillFromAssignments();
    }

    const freelancers = await prisma.freelancer.findMany({
      where: {
        ...(activeOnly ? { active: true } : {}),
        ...(q
          ? { name: { contains: q, mode: "insensitive" } }
          : {}),
      },
      orderBy: { name: "asc" },
      select: freelancerSelect,
      take: q ? 20 : 500,
    });

    const payMap = suggest ? null : await payByNameKey();

    return NextResponse.json(
      freelancers.map((f) => {
        const agg = payMap?.get(freelancerNameKey(f.name));
        return {
          ...f,
          assignmentCount: agg?.assignmentCount ?? 0,
          eventCount: agg?.eventCount ?? 0,
          totalPay: showPay ? (agg?.totalPay ?? 0) : 0,
          specialties: f.specialties.map((s) => s.specialty),
        };
      }),
    );
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("GET /api/freelancers", e);
    return NextResponse.json(
      { error: "Не удалось загрузить фрилансеров" },
      { status: 500 },
    );
  }
}

const createSchema = z.object({
  name: z.string().min(1),
  comment: z.string().optional(),
  active: z.boolean().optional(),
});

export async function POST(req: NextRequest) {
  try {
    await requireDatabaseAccess();
    await ensureSchemaOnce();
    const body = createSchema.parse(await req.json());
    const name = normalizeFreelancerName(body.name);
    if (!name) {
      return NextResponse.json({ error: "Укажите ФИО" }, { status: 400 });
    }
    const duplicate = await findFreelancerByName(prisma, name);
    if (duplicate) {
      return NextResponse.json(
        { error: "Фрилансер с таким ФИО уже есть" },
        { status: 409 },
      );
    }
    const freelancer = await prisma.freelancer.create({
      data: {
        name,
        comment: body.comment?.trim() || "",
        active: body.active ?? true,
      },
      select: freelancerSelect,
    });
    return NextResponse.json(freelancer, { status: 201 });
  } catch (e) {
    if (e instanceof Response) return e;
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.flatten() }, { status: 400 });
    }
    console.error("POST /api/freelancers", e);
    return NextResponse.json(
      { error: "Не удалось создать фрилансера" },
      { status: 500 },
    );
  }
}
