import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import {
  catalogOwnerOrNull,
  digitsAccount,
  legalEntityInclude,
} from "@/lib/legal-entity";
import { requireDatabaseAccess, requireSession } from "@/lib/session";
import { deleteUploadFile } from "@/lib/uploads";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireSession();
    const { id } = await params;
    const entity = await prisma.legalEntity.findUnique({
      where: { id },
      include: legalEntityInclude,
    });
    if (!entity) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(entity);
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}

const accountSchema = z.object({
  id: z.string().optional(),
  label: z.string().optional(),
  bankName: z.string().optional(),
  account: z.string().min(1),
  corrAccount: z.string().optional(),
  bik: z.string().optional(),
  isDefault: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

const patchSchema = z.object({
  shortName: z.string().min(1).optional(),
  fullName: z.string().optional(),
  inn: z.string().min(10).optional(),
  ogrnip: z.string().optional(),
  legalAddress: z.string().optional(),
  actualAddress: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  catalogOwner: z
    .enum(["SHOW_MASTER", "DIAKOM", "NE_EVENT"])
    .nullable()
    .optional(),
  signatoryName: z.string().optional(),
  active: z.boolean().optional(),
  accounts: z.array(accountSchema).optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireDatabaseAccess();
    const { id } = await params;
    const body = patchSchema.parse(await req.json());
    const existing = await prisma.legalEntity.findUnique({
      where: { id },
      include: { bankAccounts: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const data: Record<string, unknown> = {};
    if (body.shortName !== undefined) data.shortName = body.shortName.trim();
    if (body.fullName !== undefined) data.fullName = body.fullName.trim();
    if (body.inn !== undefined) {
      const inn = body.inn.replace(/\D/g, "");
      if (inn.length !== 10 && inn.length !== 12) {
        return NextResponse.json({ error: "ИНН: 10 или 12 цифр" }, { status: 400 });
      }
      data.inn = inn;
    }
    if (body.ogrnip !== undefined) data.ogrnip = body.ogrnip.replace(/\D/g, "");
    if (body.legalAddress !== undefined) data.legalAddress = body.legalAddress.trim();
    if (body.actualAddress !== undefined) data.actualAddress = body.actualAddress.trim();
    if (body.phone !== undefined) data.phone = body.phone.trim();
    if (body.email !== undefined) data.email = body.email.trim();
    if (body.catalogOwner !== undefined) {
      data.catalogOwner = catalogOwnerOrNull(body.catalogOwner);
    }
    if (body.signatoryName !== undefined) {
      data.signatoryName = body.signatoryName.trim();
    }
    if (body.active !== undefined) data.active = body.active;

    if (Object.keys(data).length) {
      await prisma.legalEntity.update({ where: { id }, data });
    }

    if (body.accounts) {
      const keepIds: string[] = [];
      for (let i = 0; i < body.accounts.length; i++) {
        const a = body.accounts[i];
        const account = digitsAccount(a.account);
        const payload = {
          label: a.label?.trim() || "",
          bankName: a.bankName?.trim() || "",
          account,
          corrAccount: digitsAccount(a.corrAccount || ""),
          bik: digitsAccount(a.bik || ""),
          isDefault: a.isDefault ?? i === 0,
          sortOrder: a.sortOrder ?? i,
        };
        if (a.id && existing.bankAccounts.some((x) => x.id === a.id)) {
          await prisma.legalEntityBankAccount.update({
            where: { id: a.id },
            data: payload,
          });
          keepIds.push(a.id);
        } else {
          const created = await prisma.legalEntityBankAccount.create({
            data: { legalEntityId: id, ...payload },
          });
          keepIds.push(created.id);
        }
      }
      await prisma.legalEntityBankAccount.deleteMany({
        where: { legalEntityId: id, id: { notIn: keepIds } },
      });
    }

    const entity = await prisma.legalEntity.findUnique({
      where: { id },
      include: legalEntityInclude,
    });
    return NextResponse.json(entity);
  } catch (e) {
    if (e instanceof Response) return e;
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.flatten() }, { status: 400 });
    }
    console.error("PATCH /api/legal-entities/[id]", e);
    return NextResponse.json(
      { error: "Не удалось сохранить юрлицо (возможно, дубль ИНН или р/с)" },
      { status: 400 },
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireDatabaseAccess();
    const { id } = await params;
    const existing = await prisma.legalEntity.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (existing.sealPath) await deleteUploadFile(existing.sealPath);
    if (existing.signaturePath) await deleteUploadFile(existing.signaturePath);
    await prisma.legalEntity.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}
