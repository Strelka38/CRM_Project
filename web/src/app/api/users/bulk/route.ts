import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireDatabaseAccess } from "@/lib/session";
import {
  filterDeactivateIds,
  filterRoleChangeIds,
  uniqueBulkIds,
} from "@/lib/user-bulk";
import { canAssignRole } from "@/lib/roles";
import { appRoleZod } from "@/lib/zod-enums";

const bodySchema = z.object({
  action: z.enum([
    "delete",
    "deactivate",
    "activate",
    "role",
    "addSpecialty",
  ]),
  ids: z.array(z.string()).min(1),
  role: appRoleZod.optional(),
  specialtyId: z.string().min(1).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const session = await requireDatabaseAccess();
    const body = bodySchema.parse(await req.json());
    const ids = uniqueBulkIds(body.ids, session.user.id);
    const skippedSelf = body.ids.length - ids.length;

    if (ids.length === 0) {
      return NextResponse.json({
        ok: true,
        count: 0,
        skipped: skippedSelf,
      });
    }

    const targets = await prisma.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, role: true, active: true, name: true, owners: true },
    });

    if (body.action === "addSpecialty") {
      if (!body.specialtyId) {
        return NextResponse.json(
          { error: "Не указана должность" },
          { status: 400 },
        );
      }
      const specialty = await prisma.specialty.findUnique({
        where: { id: body.specialtyId },
        select: { id: true, hourlyRate: true, shiftRate: true },
      });
      if (!specialty) {
        return NextResponse.json(
          { error: "Должность не найдена" },
          { status: 400 },
        );
      }
      const result = await prisma.userSpecialty.createMany({
        data: targets.map((u) => ({
          userId: u.id,
          specialtyId: specialty.id,
          hourlyRate: specialty.hourlyRate,
          shiftRate: specialty.shiftRate,
        })),
        skipDuplicates: true,
      });
      return NextResponse.json({
        ok: true,
        count: result.count,
        skipped: skippedSelf + (ids.length - targets.length),
      });
    }

    if (body.action === "role") {
      if (!body.role) {
        return NextResponse.json(
          { error: "Не указана роль" },
          { status: 400 },
        );
      }
      if (!canAssignRole(session.user.role, body.role, session.permissions)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      const adminCount = await prisma.user.count({
        where: { role: "ADMIN", active: true },
      });
      const { apply, skipped } = filterRoleChangeIds(
        targets,
        session.user.role,
        body.role,
        adminCount,
      );
      const result = apply.length
        ? await prisma.user.updateMany({
            where: { id: { in: apply } },
            data: { role: body.role },
          })
        : { count: 0 };
      return NextResponse.json({
        ok: true,
        count: result.count,
        skipped: skipped + skippedSelf,
      });
    }

    if (body.action === "activate") {
      const result = await prisma.user.updateMany({
        where: { id: { in: ids } },
        data: { active: true },
      });
      return NextResponse.json({
        ok: true,
        count: result.count,
        skipped: skippedSelf,
      });
    }

    const adminCount = await prisma.user.count({
      where: { role: "ADMIN", active: true },
    });
    const { apply, skipped } = filterDeactivateIds(
      targets,
      ids,
      adminCount,
    );

    if (body.action === "delete") {
      const actorId = session.user.id;
      const applyTargets = targets.filter((u) => apply.includes(u.id));
      const result = apply.length
        ? await prisma.$transaction(async (tx) => {
            for (const u of applyTargets) {
              await tx.quoteAssignment.updateMany({
                where: { userId: u.id },
                data: {
                  userId: null,
                  isFreelancer: true,
                  freelancerName: u.name,
                  owners: u.owners,
                },
              });
            }
            await tx.quote.updateMany({
              where: { ownerId: { in: apply } },
              data: { ownerId: actorId },
            });
            await tx.quoteTemplate.updateMany({
              where: { ownerId: { in: apply } },
              data: { ownerId: actorId },
            });
            await tx.calendarEntry.updateMany({
              where: { createdById: { in: apply } },
              data: { createdById: actorId },
            });
            await tx.equipmentRepair.updateMany({
              where: { reportedById: { in: apply } },
              data: { reportedById: actorId },
            });
            await tx.quoteComment.updateMany({
              where: { authorId: { in: apply } },
              data: { authorId: actorId },
            });
            await tx.quoteAttachment.updateMany({
              where: { uploaderId: { in: apply } },
              data: { uploaderId: actorId },
            });
            await tx.equipmentDocument.updateMany({
              where: { uploaderId: { in: apply } },
              data: { uploaderId: actorId },
            });
            return tx.user.deleteMany({ where: { id: { in: apply } } });
          })
        : { count: 0 };
      return NextResponse.json({
        ok: true,
        count: result.count,
        skipped: skipped + skippedSelf,
      });
    }

    const result = apply.length
      ? await prisma.user.updateMany({
          where: { id: { in: apply } },
          data: { active: false },
        })
      : { count: 0 };
    return NextResponse.json({
      ok: true,
      count: result.count,
      skipped: skipped + skippedSelf,
    });
  } catch (e) {
    if (e instanceof Response) return e;
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.flatten() }, { status: 400 });
    }
    console.error("[POST /api/users/bulk]", e);
    return NextResponse.json(
      { error: "Не удалось выполнить действие" },
      { status: 500 },
    );
  }
}
