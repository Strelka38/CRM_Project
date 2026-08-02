import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { CATALOG_OWNERS, type CatalogOwnerValue } from "@/lib/catalog-owner";
import { applyManagerAgency } from "@/lib/calc-agency";
import { buildLaborAndMontageBreakdown } from "@/lib/calc-labor";
import { buildCalcLines, defaultLineOverride } from "@/lib/calc-lines";
import { calcBlock } from "@/lib/quote-calc";
import {
  amountsFromOverride,
  computeQuoteCalculation,
  equalShares,
} from "@/lib/quote-calculation";
import { requireManager } from "@/lib/session";

const companyEnum = z.enum(["SHOW_MASTER", "DIAKOM", "NE_EVENT"]);

const lineOverrideSchema = z.object({
  blockId: z.string().min(1),
  mode: z.enum(["SHARE", "AMOUNT"]),
  ownersCustom: z.boolean(),
  owners: z.array(companyEnum),
  amounts: z.object({
    SHOW_MASTER: z.number().min(0),
    DIAKOM: z.number().min(0),
    NE_EVENT: z.number().min(0),
  }),
});

const patchSchema = z.object({
  sharesCustom: z.boolean().optional(),
  shares: z
    .array(
      z.object({
        company: companyEnum,
        percent: z.number().min(0).max(100),
      }),
    )
    .optional(),
  expenses: z
    .array(
      z.object({
        id: z.string().optional(),
        name: z.string().min(1),
        amount: z.number().min(0),
        mode: z.enum(["SHARE", "AMOUNT"]).optional(),
        company: companyEnum.nullable().optional(),
        owners: z.array(companyEnum).optional(),
        amounts: z
          .object({
            SHOW_MASTER: z.number().min(0),
            DIAKOM: z.number().min(0),
            NE_EVENT: z.number().min(0),
          })
          .optional(),
        sortOrder: z.number().int().optional(),
      }),
    )
    .optional(),
  lineOverrides: z.array(lineOverrideSchema).optional(),
  assignmentPay: z
    .array(
      z.object({
        id: z.string().min(1),
        bonus: z.number().min(0),
        montageAmount: z.number().min(0),
      }),
    )
    .optional(),
});

async function loadQuote(id: string) {
  return prisma.quote.findUnique({
    where: { id },
    include: {
      owner: { select: { id: true, name: true, owners: true } },
      zones: { orderBy: { sortOrder: "asc" } },
      blocks: {
        orderBy: { sortOrder: "asc" },
        include: {
          catalogItem: {
            select: { id: true, name: true, itemKind: true, owners: true },
          },
          kit: {
            select: {
              id: true,
              name: true,
              components: {
                select: {
                  catalogItem: { select: { owners: true, name: true } },
                },
              },
            },
          },
        },
      },
      calcShares: { orderBy: { company: "asc" } },
      extraExpenses: { orderBy: { sortOrder: "asc" } },
      calcLineOverrides: true,
      assignments: {
        include: {
          specialty: { select: { id: true, name: true } },
          user: {
            select: {
              id: true,
              name: true,
              owners: true,
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
}

function serialize(quote: NonNullable<Awaited<ReturnType<typeof loadQuote>>>) {
  const lines = buildCalcLines(quote.blocks, quote.calcLineOverrides);
  const baseCalc = computeQuoteCalculation({
    cashless: quote.cashless,
    durationDays: quote.durationDays,
    discountPercent: quote.discountPercent,
    lines,
    expenses: quote.extraExpenses.map((e) => ({
      ...e,
      owners: e.owners as CatalogOwnerValue[],
      amounts: amountsFromOverride(e),
    })),
    sharesCustom: quote.sharesCustom,
    customShares: quote.calcShares,
  });

  const overrideByBlock = new Map(
    quote.calcLineOverrides.map((o) => [o.blockId, o]),
  );

  const lineDetails = lines
    .map((line) => {
      const { block, catalogOwners, override } = line;
      if (block.type !== "ITEM" && block.type !== "KIT_HEADER") return null;
      // Калькуляция всегда в наличных
      const c = calcBlock(
        { ...block, type: "ITEM" },
        false,
        quote.durationDays,
      );
      const lineTotal = Math.round(c.lineTotalCash);
      if (lineTotal <= 0) return null;
      const kitName =
        quote.blocks.find((x) => x.id === block.id)?.kit?.name ?? null;
      const stored = block.id ? overrideByBlock.get(block.id) : undefined;
      const effective = override ?? defaultLineOverride(catalogOwners, lineTotal);
      const owners = effective.ownersCustom
        ? effective.owners
        : catalogOwners;

      return {
        id: block.id,
        name: block.name || block.title || kitName || "Позиция",
        type: block.type,
        lineTotal,
        catalogOwners,
        owners,
        ownersCustom: effective.ownersCustom,
        mode: effective.mode,
        amounts: effective.amounts,
        hasOverride: Boolean(stored),
      };
    })
    .filter(Boolean) as Array<{
    id: string;
    name: string;
    type: string;
    lineTotal: number;
    catalogOwners: CatalogOwnerValue[];
    owners: CatalogOwnerValue[];
    ownersCustom: boolean;
    mode: "SHARE" | "AMOUNT";
    amounts: ReturnType<typeof amountsFromOverride>;
    hasOverride: boolean;
  }>;

  const revenueByCompany: Partial<Record<CatalogOwnerValue, number>> = {};
  const expensesByCompany: Partial<Record<CatalogOwnerValue, number>> = {};
  for (const b of baseCalc.breakdown) {
    revenueByCompany[b.company] = b.revenue;
    expensesByCompany[b.company] = b.expenses;
  }

  const laborMontage = buildLaborAndMontageBreakdown({
    assignments: quote.assignments,
    revenueByCompany,
    expensesByCompany,
  });

  const withPercents = laborMontage.breakdown.map((row) => {
    const base = baseCalc.breakdown.find((b) => b.company === row.company);
    return {
      ...row,
      autoPercent: base?.autoPercent ?? 0,
      percent: base?.percent ?? 0,
    };
  });

  const { breakdown, agency, agencyDeductedTotal } = applyManagerAgency(
    withPercents,
    quote.owner.owners as CatalogOwnerValue[],
  );

  const calc = {
    ...baseCalc,
    laborTotal: laborMontage.laborTotal,
    montageTotal: laborMontage.montageTotal,
    agencyTotal: agency.total,
    agencyDeductedTotal,
    agency,
    breakdown,
    // Нетто фирм: выручка − расходы − ЗП − монтажные − агентские (только списанные с фирм менеджера)
    netTotal: Math.round(
      baseCalc.payable -
        baseCalc.expensesTotal -
        laborMontage.laborTotal -
        laborMontage.montageTotal -
        agencyDeductedTotal,
    ),
  };

  return {
    id: quote.id,
    proposalNumber: quote.proposalNumber,
    eventName: quote.eventName,
    date: quote.date,
    eventDate: quote.eventDate,
    client: quote.client,
    lifecycle: quote.lifecycle,
    paid: quote.paid,
    cashless: quote.cashless,
    durationDays: quote.durationDays,
    discountPercent: quote.discountPercent,
    owner: {
      id: quote.owner.id,
      name: quote.owner.name,
      owners: quote.owner.owners as CatalogOwnerValue[],
    },
    agency,
    sharesCustom: quote.sharesCustom,
    shares: quote.sharesCustom
      ? quote.calcShares.map((s) => ({
          company: s.company,
          percent: s.percent,
        }))
      : calc.autoShares,
    expenses: quote.extraExpenses.map((e) => {
      const amounts = amountsFromOverride(e);
      const owners =
        e.owners.length > 0
          ? (e.owners as CatalogOwnerValue[])
          : e.company
            ? ([e.company] as CatalogOwnerValue[])
            : [];
      return {
        id: e.id,
        name: e.name,
        amount: e.amount,
        mode: e.mode,
        company: e.company,
        owners,
        amounts,
        sortOrder: e.sortOrder,
      };
    }),
    companies: CATALOG_OWNERS,
    lineDetails,
    assignments: laborMontage.assignmentRows,
    calculation: calc,
  };
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireManager();
    const { id } = await params;
    const quote = await loadQuote(id);
    if (!quote) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(serialize(quote));
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("GET /api/calculations/[id]", e);
    return NextResponse.json(
      { error: "Не удалось загрузить калькуляцию" },
      { status: 500 },
    );
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireManager();
    const { id } = await params;
    const body = patchSchema.parse(await req.json());

    const existing = await prisma.quote.findUnique({
      where: { id },
      include: {
        blocks: {
          include: {
            catalogItem: { select: { owners: true } },
            kit: {
              select: {
                components: {
                  select: { catalogItem: { select: { owners: true } } },
                },
              },
            },
          },
        },
        calcShares: true,
        calcLineOverrides: true,
      },
    });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const blockIds = new Set(existing.blocks.map((b) => b.id));

    await prisma.$transaction(async (tx) => {
      // Меняем доли только при явном sharesCustom (не при сохранении премий/строк)
      if (body.sharesCustom === false) {
        await tx.quoteCalcShare.deleteMany({ where: { quoteId: id } });
        await tx.quote.update({
          where: { id },
          data: { sharesCustom: false },
        });
      } else if (body.sharesCustom === true) {
        let shares = body.shares;
        if (!shares || shares.length === 0) {
          const lines = buildCalcLines(
            existing.blocks,
            existing.calcLineOverrides,
          );
          const auto = computeQuoteCalculation({
            cashless: existing.cashless,
            durationDays: existing.durationDays,
            discountPercent: existing.discountPercent,
            lines,
            expenses: [],
            sharesCustom: false,
          });
          shares =
            auto.autoShares.length > 0
              ? auto.autoShares
              : equalShares(["SHOW_MASTER", "DIAKOM", "NE_EVENT"]);
        }
        const percentSum = shares.reduce((s, x) => s + x.percent, 0);
        if (percentSum <= 0) {
          throw new Error("SHARES_SUM");
        }
        await tx.quote.update({
          where: { id },
          data: { sharesCustom: true },
        });
        await tx.quoteCalcShare.deleteMany({ where: { quoteId: id } });
        await tx.quoteCalcShare.createMany({
          data: shares.map((s) => ({
            quoteId: id,
            company: s.company,
            percent: s.percent,
          })),
        });
      }

      if (body.expenses) {
        await tx.quoteExtraExpense.deleteMany({ where: { quoteId: id } });
        if (body.expenses.length > 0) {
          await tx.quoteExtraExpense.createMany({
            data: body.expenses.map((e, i) => {
              const mode = e.mode ?? "SHARE";
              const amounts = e.amounts ?? {
                SHOW_MASTER: 0,
                DIAKOM: 0,
                NE_EVENT: 0,
              };
              const amountSum =
                amounts.SHOW_MASTER + amounts.DIAKOM + amounts.NE_EVENT;
              const owners = e.owners ?? [];
              return {
                quoteId: id,
                name: e.name.trim(),
                amount:
                  mode === "AMOUNT"
                    ? amountSum
                    : e.amount,
                mode,
                company: owners.length === 1 ? owners[0] : (e.company ?? null),
                owners,
                amountShowMaster: amounts.SHOW_MASTER,
                amountDiakom: amounts.DIAKOM,
                amountNeEvent: amounts.NE_EVENT,
                sortOrder: e.sortOrder ?? i,
              };
            }),
          });
        }
      }

      if (body.lineOverrides) {
        const valid = body.lineOverrides.filter((o) => blockIds.has(o.blockId));
        await tx.quoteCalcLineOverride.deleteMany({ where: { quoteId: id } });
        if (valid.length > 0) {
          await tx.quoteCalcLineOverride.createMany({
            data: valid.map((o) => ({
              quoteId: id,
              blockId: o.blockId,
              mode: o.mode,
              ownersCustom: o.ownersCustom,
              owners: o.owners,
              amountShowMaster: o.amounts.SHOW_MASTER,
              amountDiakom: o.amounts.DIAKOM,
              amountNeEvent: o.amounts.NE_EVENT,
            })),
          });
        }
      }

      if (body.assignmentPay) {
        for (const row of body.assignmentPay) {
          await tx.quoteAssignment.updateMany({
            where: { id: row.id, quoteId: id },
            data: {
              bonus: Math.max(0, row.bonus),
              montageAmount: Math.max(0, row.montageAmount),
            },
          });
        }
      }
    });

    const quote = await loadQuote(id);
    return NextResponse.json(serialize(quote!));
  } catch (e) {
    if (e instanceof Response) return e;
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.flatten() }, { status: 400 });
    }
    if (e instanceof Error && e.message === "SHARES_SUM") {
      return NextResponse.json(
        { error: "Сумма долей должна быть больше 0" },
        { status: 400 },
      );
    }
    console.error("PATCH /api/calculations/[id]", e);
    return NextResponse.json(
      { error: "Не удалось сохранить калькуляцию" },
      { status: 500 },
    );
  }
}
