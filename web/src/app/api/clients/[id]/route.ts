import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { calcAssignmentPay } from "@/lib/payroll";
import { calcByZones } from "@/lib/quote-calc";
import { requireManager } from "@/lib/session";

const clientSelect = {
  id: true,
  companyName: true,
  contactName: true,
  phone: true,
  email: true,
  comment: true,
  inn: true,
  legalAddress: true,
  legalDetails: true,
  active: true,
  createdAt: true,
  updatedAt: true,
};

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireManager();
    const { id } = await params;

    const client = await prisma.client.findUnique({
      where: { id },
      select: clientSelect,
    });
    if (!client) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const quotes = await prisma.quote.findMany({
      where: { clientId: id },
      orderBy: [{ eventDate: "desc" }, { createdAt: "desc" }],
      include: {
        zones: { orderBy: { sortOrder: "asc" } },
        blocks: {
          orderBy: { sortOrder: "asc" },
          include: {
            catalogItem: { select: { itemKind: true } },
          },
        },
        assignments: {
          include: {
            specialty: { select: { id: true, name: true } },
            user: {
              select: {
                id: true,
                name: true,
                specialties: {
                  select: {
                    specialtyId: true,
                    hourlyRate: true,
                    shiftRate: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    const projects = quotes.map((q) => {
      const blockInputs = q.blocks.map((b) => ({
        ...b,
        itemKind: b.catalogItem?.itemKind ?? null,
      }));
      const totals = calcByZones(
        q.zones,
        blockInputs,
        q.cashless,
        q.durationDays,
        q.discountPercent,
      );
      const laborCost = q.assignments.reduce((sum, a) => {
        const rates = a.user.specialties.find(
          (s) => s.specialtyId === a.specialtyId,
        );
        return (
          sum +
          calcAssignmentPay({
            payMode: a.payMode,
            hours: a.hours,
            rateOverride: a.rateOverride,
            hourlyRate: rates?.hourlyRate ?? 0,
            shiftRate: rates?.shiftRate ?? 0,
          })
        );
      }, 0);
      const countsForStats = ["CONFIRMED", "COMPLETED"].includes(q.lifecycle);
      return {
        id: q.id,
        proposalNumber: q.proposalNumber,
        eventName: q.eventName,
        date: q.date,
        lifecycle: q.lifecycle,
        paid: q.paid,
        revenue: totals.payable,
        laborCost,
        profit: totals.payable - laborCost,
        countsForStats,
      };
    });

    const statsProjects = projects.filter((p) => p.countsForStats);
    const revenue = statsProjects.reduce((s, p) => s + p.revenue, 0);
    const laborCost = statsProjects.reduce((s, p) => s + p.laborCost, 0);
    const profit = revenue - laborCost;
    const paidRevenue = statsProjects
      .filter((p) => p.paid)
      .reduce((s, p) => s + p.revenue, 0);

    return NextResponse.json({
      ...client,
      stats: {
        projectCount: statsProjects.length,
        totalProjects: projects.length,
        revenue,
        laborCost,
        profit,
        paidRevenue,
      },
      projects,
    });
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}

const patchSchema = z.object({
  companyName: z.string().min(1).optional(),
  contactName: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  comment: z.string().optional(),
  inn: z.string().optional(),
  legalAddress: z.string().optional(),
  legalDetails: z.string().optional(),
  active: z.boolean().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireManager();
    const { id } = await params;
    const body = patchSchema.parse(await req.json());

    const existing = await prisma.client.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const data: Record<string, unknown> = {};
    if (body.companyName !== undefined) data.companyName = body.companyName.trim();
    if (body.contactName !== undefined) data.contactName = body.contactName.trim();
    if (body.phone !== undefined) data.phone = body.phone.trim();
    if (body.email !== undefined) data.email = body.email.trim();
    if (body.comment !== undefined) data.comment = body.comment.trim();
    if (body.inn !== undefined) data.inn = body.inn.trim();
    if (body.legalAddress !== undefined) data.legalAddress = body.legalAddress.trim();
    if (body.legalDetails !== undefined) data.legalDetails = body.legalDetails.trim();
    if (body.active !== undefined) data.active = body.active;

    const client = await prisma.client.update({
      where: { id },
      data,
      select: clientSelect,
    });

    // Keep denormalized Quote.client in sync when company name changes
    if (
      body.companyName !== undefined &&
      body.companyName.trim() !== existing.companyName
    ) {
      await prisma.quote.updateMany({
        where: { clientId: id },
        data: { client: body.companyName.trim() },
      });
    }

    return NextResponse.json(client);
  } catch (e) {
    if (e instanceof Response) return e;
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.flatten() }, { status: 400 });
    }
    throw e;
  }
}
