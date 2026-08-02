import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { syncInvoiceNotifications } from "@/lib/notifications";
import { requireSession } from "@/lib/session";

export async function GET() {
  try {
    const session = await requireSession();
    await syncInvoiceNotifications();
    const notifications = await prisma.notification.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        quote: {
          select: {
            id: true,
            eventName: true,
            proposalNumber: true,
            invoiceSent: true,
            paid: true,
          },
        },
      },
    });
    const unread = await prisma.notification.count({
      where: { userId: session.user.id, read: false },
    });
    return NextResponse.json({ notifications, unread });
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await requireSession();
    const body = (await req.json()) as {
      id?: string;
      all?: boolean;
      read?: boolean;
    };
    if (body.all) {
      await prisma.notification.updateMany({
        where: { userId: session.user.id, read: false },
        data: { read: true },
      });
      return NextResponse.json({ ok: true });
    }
    if (!body.id) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }
    await prisma.notification.updateMany({
      where: { id: body.id, userId: session.user.id },
      data: { read: body.read ?? true },
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}
