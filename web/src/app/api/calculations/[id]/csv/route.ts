import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { csvFileResponse, readUploadedCsv } from "@/lib/csv";
import {
  CALC_LINE_CSV_HEADERS,
  CALC_STAFF_CSV_HEADERS,
  CALC_STATS_CSV_HEADERS,
  calcLineToCsvCells,
  calcStaffToCsvCells,
  calcStatsToCsvCells,
  parseCalcLineCsv,
  parseCalcStaffCsv,
  type CalcLineCsvSource,
  type CalcStatsCsvRow,
} from "@/lib/calc-csv";
import { ownerShorts, type CatalogOwnerValue } from "@/lib/catalog-owner";
import {
  buildCalcLines,
  catalogOwnersForBlock,
  defaultLineOverride,
} from "@/lib/calc-lines";
import { buildAssignmentLaborRows } from "@/lib/calc-labor";
import { calcBlock } from "@/lib/quote-calc";
import { amountsFromOverride } from "@/lib/quote-calculation";
import { requireManager } from "@/lib/session";

function kindParam(req: NextRequest): "lines" | "staff" | "stats" {
  const raw = (req.nextUrl.searchParams.get("kind") || "lines").toLowerCase();
  if (raw === "staff" || raw === "stats") return raw;
  return "lines";
}

async function loadQuote(id: string) {
  return prisma.quote.findUnique({
    where: { id },
    include: {
      zones: { orderBy: { sortOrder: "asc" } },
      blocks: {
        orderBy: { sortOrder: "asc" },
        include: {
          catalogItem: {
            select: {
              name: true,
              itemKind: true,
              owners: true,
              costPrice: true,
            },
          },
          kit: {
            select: {
              name: true,
              components: {
                select: { catalogItem: { select: { owners: true } } },
              },
            },
          },
        },
      },
      calcLineOverrides: true,
      extraExpenses: { orderBy: { sortOrder: "asc" } },
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

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireManager();
    const { id } = await params;
    const quote = await loadQuote(id);
    if (!quote) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const kind = kindParam(req);
    const stamp = new Date().toISOString().slice(0, 10);
    const base = `calc-${quote.proposalNumber}`;

    const staffRows = buildAssignmentLaborRows(quote.assignments);

    if (kind === "staff") {
      return csvFileResponse(`${base}-staff-${stamp}.csv`, [
        [...CALC_STAFF_CSV_HEADERS],
        ...staffRows.map((a) =>
          calcStaffToCsvCells({
            id: a.id,
            userName: a.userName,
            kind: a.kind,
            specialtyName: a.specialtyName,
            owners: a.owners,
            payMode: a.payMode,
            hours: a.hours,
            isFreelancer: a.isFreelancer,
            basePay: a.basePay,
            bonus: a.bonus,
            montageAmount: a.montageAmount,
          }),
        ),
      ]);
    }

    if (kind === "stats") {
      const stats: CalcStatsCsvRow[] = [];
      for (const a of staffRows) {
        stats.push({
          kind: a.kind === "MOUNT" ? "монтаж" : a.isFreelancer ? "фриланс" : "шоу",
          name: a.userName,
          extra: a.specialtyName,
          company: ownerShorts(a.owners),
          base: a.basePay,
          extraAmount: a.bonus,
          montage: a.montageAmount,
          total: a.basePay + a.bonus,
        });
      }
      for (const e of quote.extraExpenses) {
        stats.push({
          kind: "расход",
          name: e.name,
          extra: e.mode === "AMOUNT" ? "суммы" : "доли",
          company: ownerShorts((e.owners ?? []) as CatalogOwnerValue[]),
          total: e.amount,
        });
      }
      return csvFileResponse(`${base}-stats-${stamp}.csv`, [
        [...CALC_STATS_CSV_HEADERS],
        ...stats.map(calcStatsToCsvCells),
      ]);
    }

    const zoneName = new Map(quote.zones.map((z) => [z.id, z.name]));
    const overrideByBlock = new Map(
      quote.calcLineOverrides.map((o) => [o.blockId, o]),
    );
    const lines: CalcLineCsvSource[] = quote.blocks
      .filter((b) => b.type === "ITEM" || b.type === "KIT_HEADER")
      .map((b) => {
        const c = calcBlock(
          { ...b, type: "ITEM", itemKind: b.catalogItem?.itemKind ?? null },
          false,
          quote.durationDays,
        );
        const lineTotal = Math.round(c.lineTotalCash);
        const catalogOwners = catalogOwnersForBlock(b);
        const stored = overrideByBlock.get(b.id);
        const effective = stored
          ? {
              mode: stored.mode,
              ownersCustom: stored.ownersCustom,
              owners: stored.owners as CatalogOwnerValue[],
              amounts: amountsFromOverride(stored),
              costOverride:
                stored.costOverride == null ? null : Number(stored.costOverride),
            }
          : defaultLineOverride(catalogOwners, lineTotal);
        return {
          id: b.id,
          zoneName: b.zoneId ? (zoneName.get(b.zoneId) ?? "") : "",
          type: b.type,
          name: b.name || b.catalogItem?.name || b.kit?.name || "Позиция",
          qty: b.qty,
          unitPrice: b.unitPrice,
          dayMode: b.dayMode,
          dayCoef: c.dayCoef,
          lineTotal,
          costOverride: effective.costOverride ?? null,
          costTotal: 0,
          owners: effective.ownersCustom ? effective.owners : catalogOwners,
          mode: effective.mode,
          amounts: effective.amounts,
        };
      });

    return csvFileResponse(`${base}-lines-${stamp}.csv`, [
      [...CALC_LINE_CSV_HEADERS],
      ...lines.map(calcLineToCsvCells),
    ]);
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("GET /api/calculations/[id]/csv", e);
    return NextResponse.json(
      { error: "Не удалось экспортировать" },
      { status: 500 },
    );
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireManager();
    const { id } = await params;
    const kind = kindParam(req);
    if (kind === "stats") {
      return NextResponse.json(
        { error: "Статистику можно только выгрузить" },
        { status: 400 },
      );
    }
    const uploaded = await readUploadedCsv(req);
    if ("error" in uploaded) return uploaded.error;

    const existing = await prisma.quote.findUnique({
      where: { id },
      include: {
        blocks: {
          include: {
            catalogItem: {
              select: { owners: true, costPrice: true, itemKind: true },
            },
            kit: {
              select: {
                components: {
                  select: { catalogItem: { select: { owners: true } } },
                },
              },
            },
          },
        },
        calcLineOverrides: true,
        assignments: true,
      },
    });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (kind === "staff") {
      const { rows, errors } = parseCalcStaffCsv(uploaded.text);
      const byId = new Map(existing.assignments.map((a) => [a.id, a]));
      let updated = 0;
      let skipped = 0;
      for (const row of rows) {
        if (!byId.has(row.id)) {
          skipped += 1;
          continue;
        }
        await prisma.quoteAssignment.update({
          where: { id: row.id },
          data: {
            ...(row.bonus != null ? { bonus: row.bonus } : {}),
            ...(row.montageAmount != null
              ? { montageAmount: row.montageAmount }
              : {}),
          },
        });
        updated += 1;
      }
      return NextResponse.json({
        updated,
        skipped,
        errors,
        errorCount: errors.length,
      });
    }

    const { rows, errors } = parseCalcLineCsv(uploaded.text);
    const blockIds = new Set(existing.blocks.map((b) => b.id));
    const lines = buildCalcLines(existing.blocks, existing.calcLineOverrides);
    const nextByBlock = new Map<
      string,
      {
        blockId: string;
        mode: "SHARE" | "AMOUNT";
        ownersCustom: boolean;
        owners: CatalogOwnerValue[];
        amounts: ReturnType<typeof amountsFromOverride>;
        costOverride: number | null;
      }
    >(
      existing.calcLineOverrides.map((o) => [
        o.blockId,
        {
          blockId: o.blockId,
          mode: o.mode as "SHARE" | "AMOUNT",
          ownersCustom: o.ownersCustom,
          owners: o.owners as CatalogOwnerValue[],
          amounts: amountsFromOverride(o),
          costOverride:
            o.costOverride == null ? null : Number(o.costOverride),
        },
      ]),
    );

    let updated = 0;
    let skipped = 0;
    for (const row of rows) {
      if (!blockIds.has(row.blockId)) {
        skipped += 1;
        continue;
      }
      const line = lines.find((l) => l.block.id === row.blockId);
      const catalogOwners = line?.catalogOwners ?? [];
      const b = existing.blocks.find((x) => x.id === row.blockId);
      const lineTotal = b
        ? Math.round(
            calcBlock(
              {
                ...b,
                type: "ITEM",
                itemKind: b.catalogItem?.itemKind ?? null,
              },
              false,
              existing.durationDays,
            ).lineTotalCash,
          )
        : 0;
      const base =
        nextByBlock.get(row.blockId) ??
        (() => {
          const d = defaultLineOverride(catalogOwners, lineTotal);
          return {
            blockId: row.blockId,
            mode: d.mode,
            ownersCustom: d.ownersCustom,
            owners: d.owners,
            amounts: d.amounts,
            costOverride: d.costOverride ?? null,
          };
        })();
      if (row.hasCost) {
        base.costOverride =
          row.costOverride == null ? null : Math.max(0, row.costOverride);
      }
      if (row.hasOwners) {
        base.owners = row.owners;
        base.ownersCustom = true;
      }
      if (row.mode) base.mode = row.mode;
      if (row.amounts) {
        base.amounts = row.amounts;
        base.mode = "AMOUNT";
        base.ownersCustom = true;
      }
      nextByBlock.set(row.blockId, base);
      updated += 1;
    }

    await prisma.$transaction(async (tx) => {
      await tx.quoteCalcLineOverride.deleteMany({ where: { quoteId: id } });
      const valid = [...nextByBlock.values()].filter((o) =>
        blockIds.has(o.blockId),
      );
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
            costOverride:
              o.costOverride == null ? null : Math.max(0, o.costOverride),
          })),
        });
      }
    });

    return NextResponse.json({
      updated,
      skipped,
      errors,
      errorCount: errors.length,
    });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("POST /api/calculations/[id]/csv", e);
    return NextResponse.json(
      { error: "Не удалось импортировать" },
      { status: 500 },
    );
  }
}
