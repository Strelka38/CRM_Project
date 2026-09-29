import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getMasterTimezone, userTimezoneOrMaster } from "@/lib/app-settings";
import { addDays, formatDateKey, startOfDay } from "@/lib/dates";
import {
  syncInvoiceNotifications,
  syncOpenTaskNotifications,
} from "@/lib/notifications";
import { displayUserName } from "@/lib/calendar-entries";
import {
  canManageAssignments,
  canSeeAllEvents,
  isManager,
  requireSession,
} from "@/lib/session";
import { STATS_LIFECYCLES } from "@/lib/lifecycle";
import {
  formatVacantRoles,
  vacantStaffLabels,
} from "@/lib/staff-slots";
import { greetingFor } from "@/lib/timezone";
import { fetchWeather, type WeatherPlaceId } from "@/lib/weather";

function utcDateOnly(d: Date): Date {
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
}

function quoteTitle(q: { proposalNumber: string; eventName: string }) {
  const name = q.eventName.trim();
  return name ? `№${q.proposalNumber} ${name}` : `№${q.proposalNumber} КП`;
}

function entryDateKey(d: Date) {
  return formatDateKey(
    new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
  );
}

export async function GET() {
  try {
    const session = await requireSession();
    await syncInvoiceNotifications();
    await syncOpenTaskNotifications();

    const role = session.user.role;
    const manager = isManager(role);
    const assigner = canManageAssignments(role, session.permissions);
    const employee = !canSeeAllEvents(role, session.permissions);
    const showTasks = role === "BRIGADIER" || employee;

    const today = startOfDay(new Date());
    const recent = addDays(today, -7);
    const todayUtc = utcDateOnly(today);

    const me = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        firstName: true,
        name: true,
        timezone: true,
        weatherPlace: true,
      },
    });
    const masterTimezone = await getMasterTimezone();
    const timezone = userTimezoneOrMaster(me?.timezone, masterTimezone);
    const greetName = (me?.firstName || me?.name || "").trim().split(/\s+/)[0] || "";
    const weatherPlace = (me?.weatherPlace || "IRKUTSK") as WeatherPlaceId;
    const weather = await fetchWeather(weatherPlace);

    const unpaid = manager
      ? await prisma.quote.findMany({
          where: {
            invoiceRequired: true,
            paid: false,
            lifecycle: { in: [...STATS_LIFECYCLES] },
          },
          orderBy: [{ eventDate: "asc" }, { updatedAt: "desc" }],
          take: 12,
          select: {
            id: true,
            proposalNumber: true,
            eventName: true,
            client: true,
            date: true,
          },
        })
      : [];

    const vacantRows = assigner
      ? await prisma.quote.findMany({
          where: {
            lifecycle: { in: [...STATS_LIFECYCLES] },
            assignments: {
              some: {
                userId: null,
                isFreelancer: false,
                kind: { not: "MOUNT" },
              },
            },
            OR: [{ eventDate: { gte: recent } }, { eventDate: null }],
          },
          orderBy: [{ eventDate: "asc" }, { updatedAt: "desc" }],
          take: 20,
          select: {
            id: true,
            proposalNumber: true,
            eventName: true,
            date: true,
            assignments: {
              select: {
                userId: true,
                isFreelancer: true,
                kind: true,
                specialty: { select: { name: true } },
              },
            },
          },
        })
      : [];

    const vacantStaff = vacantRows
      .map((q) => {
        const vacant = vacantStaffLabels(q.assignments);
        return {
          id: q.id,
          title: quoteTitle(q),
          date: q.date,
          staffVacant: formatVacantRoles(vacant),
          staffVacantCount: vacant.length,
        };
      })
      .filter((q) => q.staffVacantCount > 0)
      .slice(0, 12);

    const rentals = manager
      ? (
          await prisma.calendarEntry.findMany({
            where: { kind: "RENTAL", date: { gte: todayUtc } },
            orderBy: [{ date: "asc" }, { createdAt: "asc" }],
            take: 12,
            select: { id: true, title: true, date: true },
          })
        ).map((e) => ({
          id: e.id,
          title: e.title,
          date: entryDateKey(e.date),
        }))
      : [];

    const taskWhere = employee
      ? {
          kind: "TASK" as const,
          assignees: { some: { userId: session.user.id } },
          OR: [
            { completedAt: null, date: { gte: addDays(todayUtc, -30) } },
            { completedAt: { not: null }, date: { gte: recent } },
          ],
        }
      : {
          kind: "TASK" as const,
          OR: [
            { completedAt: null, date: { gte: addDays(todayUtc, -30) } },
            { date: { gte: todayUtc } },
          ],
        };

    const taskRows = showTasks
      ? await prisma.calendarEntry.findMany({
          where: taskWhere,
          orderBy: [{ completedAt: "asc" }, { date: "asc" }],
          take: 16,
          select: {
            id: true,
            title: true,
            date: true,
            completedAt: true,
            assignees: {
              select: {
                userId: true,
                user: {
                  select: { name: true, firstName: true, lastName: true },
                },
              },
            },
          },
        })
      : [];

    const tasks = taskRows.map((t) => ({
      id: t.id,
      title: t.title,
      date: entryDateKey(t.date),
      completed: Boolean(t.completedAt),
      canComplete: t.assignees.some((a) => a.userId === session.user.id),
      assignees: t.assignees.map((a) => displayUserName(a.user)).join(", "),
    }));

    const myEvents = employee
      ? (
          await prisma.quote.findMany({
            where: {
              lifecycle: { in: [...STATS_LIFECYCLES] },
              assignments: { some: { userId: session.user.id } },
              OR: [{ eventDate: { gte: recent } }, { eventDate: null }],
            },
            orderBy: [{ eventDate: "asc" }, { updatedAt: "desc" }],
            take: 12,
            select: {
              id: true,
              proposalNumber: true,
              eventName: true,
              date: true,
              place: true,
              time: true,
            },
          })
        ).map((q) => ({
          id: q.id,
          title: quoteTitle(q),
          date: q.date,
          place: q.place,
          time: q.time,
        }))
      : [];

    return NextResponse.json({
      greeting: greetingFor(new Date(), timezone, greetName),
      greetingName: greetName,
      timezone,
      masterTimezone,
      weather,
      showUnpaid: manager,
      showVacant: assigner,
      showRentals: manager,
      showTasks,
      showMyEvents: employee,
      unpaid: unpaid.map((q) => ({
        id: q.id,
        title: quoteTitle(q),
        date: q.date,
        client: q.client,
      })),
      vacantStaff,
      rentals,
      tasks,
      myEvents,
    });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("GET /api/calendar/dashboard", e);
    return NextResponse.json(
      { error: "Не удалось загрузить дашборд" },
      { status: 500 },
    );
  }
}
