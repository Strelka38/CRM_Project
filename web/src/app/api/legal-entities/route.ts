import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import {
  catalogOwnerOrNull,
  digitsAccount,
  legalEntityInclude,
} from "@/lib/legal-entity";
import { requireDatabaseAccess, requireSession } from "@/lib/session";
import { catalogOwnerZod } from "@/lib/zod-enums";

export async function GET(req: NextRequest) {
  try {
    await requireSession();
    const activeOnly = req.nextUrl.searchParams.get("active") !== "0";
    const rows = await prisma.legalEntity.findMany({
      where: activeOnly ? { active: true } : {},
      orderBy: { shortName: "asc" },
      include: legalEntityInclude,
    });
    return NextResponse.json(rows);
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("GET /api/legal-entities", e);
    return NextResponse.json(
      { error: "Не удалось загрузить юрлица" },
      { status: 500 },
    );
  }
}

const accountSchema = z.object({
  label: z.string().optional(),
  bankName: z.string().optional(),
  account: z.string().min(1),
  corrAccount: z.string().optional(),
  bik: z.string().optional(),
  isDefault: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

const createSchema = z.object({
  shortName: z.string().min(1),
  fullName: z.string().optional(),
  inn: z.string().min(10),
  ogrnip: z.string().optional(),
  legalAddress: z.string().optional(),
  actualAddress: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  catalogOwner: catalogOwnerZod.nullable().optional(),
  signatoryName: z.string().optional(),
  active: z.boolean().optional(),
  accounts: z.array(accountSchema).optional(),
});

export async function POST(req: NextRequest) {
  try {
    await requireDatabaseAccess();
    const body = createSchema.parse(await req.json());
    const inn = body.inn.replace(/\D/g, "");
    if (inn.length !== 10 && inn.length !== 12) {
      return NextResponse.json({ error: "ИНН: 10 или 12 цифр" }, { status: 400 });
    }
    const existing = await prisma.legalEntity.findUnique({ where: { inn } });
    if (existing) {
      return NextResponse.json(
        { error: "Юрлицо с таким ИНН уже есть" },
        { status: 409 },
      );
    }

    const entity = await prisma.legalEntity.create({
      data: {
        shortName: body.shortName.trim(),
        fullName: body.fullName?.trim() || "",
        inn,
        ogrnip: (body.ogrnip || "").replace(/\D/g, ""),
        legalAddress: body.legalAddress?.trim() || "",
        actualAddress: body.actualAddress?.trim() || body.legalAddress?.trim() || "",
        phone: body.phone?.trim() || "",
        email: body.email?.trim() || "",
        catalogOwner: catalogOwnerOrNull(body.catalogOwner),
        signatoryName: body.signatoryName?.trim() || "",
        active: body.active ?? true,
        bankAccounts: body.accounts?.length
          ? {
              create: body.accounts.map((a, i) => ({
                label: a.label?.trim() || "",
                bankName: a.bankName?.trim() || "",
                account: digitsAccount(a.account),
                corrAccount: digitsAccount(a.corrAccount || ""),
                bik: digitsAccount(a.bik || ""),
                isDefault: a.isDefault ?? i === 0,
                sortOrder: a.sortOrder ?? i,
              })),
            }
          : undefined,
      },
      include: legalEntityInclude,
    });
    return NextResponse.json(entity, { status: 201 });
  } catch (e) {
    if (e instanceof Response) return e;
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.flatten() }, { status: 400 });
    }
    console.error("POST /api/legal-entities", e);
    return NextResponse.json(
      { error: "Не удалось создать юрлицо" },
      { status: 500 },
    );
  }
}
