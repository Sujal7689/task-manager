import { Prisma, TimesheetEntryType } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { AppError } from "../../utils/appError";
import { getDirectReportIds } from "../users/users.service";

interface AuthUser {
  id: string;
  role: string;
  departmentId: string | null;
  companyId: string | null;
}

export function toDate(d: string) {
  const parsed = new Date(d);
  return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()));
}

export async function getUserTimesheet(
  userId: string,
  from: string,
  to: string,
  options?: { skip: number; take: number; search?: string },
) {
  const where: Prisma.TimesheetEntryWhereInput = {
    userId,
    date: { gte: toDate(from), lte: toDate(to) },
    ...(options?.search ? { task: { name: { contains: options.search, mode: "insensitive" } } } : {}),
  };
  const include = { task: { select: { id: true, taskNumber: true, name: true } } };
  const orderBy = { date: "asc" as const };

  if (!options) {
    return prisma.timesheetEntry.findMany({ where, include, orderBy });
  }
  const [items, total] = await Promise.all([
    prisma.timesheetEntry.findMany({ where, include, orderBy, skip: options.skip, take: options.take }),
    prisma.timesheetEntry.count({ where }),
  ]);
  return { items, total };
}

export interface ManualEntryInput {
  date: string;
  hoursLogged: number;
  entryType: Exclude<TimesheetEntryType, "TASK_WORK">;
}

export async function createManualEntry(userId: string, input: ManualEntryInput) {
  return prisma.timesheetEntry.create({
    data: {
      userId,
      date: toDate(input.date),
      hoursLogged: input.hoursLogged,
      entryType: input.entryType,
    },
  });
}

// Reusable role-scoping for anything that reports on a "team's" timesheet data
// (Manager = department, Team Lead = direct reports, Admin = everyone).
// Returns undefined for Admin (meaning "no restriction").
export async function getVisibleTimesheetUserIds(user: AuthUser): Promise<string[] | undefined> {
  if (user.role === "ADMIN") return undefined;
  if (user.role === "MANAGER") {
    if (!user.departmentId) throw new AppError(400, "Manager has no department assigned");
    const users = await prisma.user.findMany({ where: { departmentId: user.departmentId }, select: { id: true } });
    return users.map((u) => u.id);
  }
  if (user.role === "TEAM_LEAD") {
    return [...(await getDirectReportIds(user.id)), user.id];
  }
  throw new AppError(403, "Insufficient permissions to view team timesheet");
}

export async function getTeamTimesheet(
  user: AuthUser,
  from: string,
  to: string,
  options?: { skip: number; take: number; search?: string },
) {
  const userIds = await getVisibleTimesheetUserIds(user);

  const where: Prisma.TimesheetEntryWhereInput = {
    userId: userIds ? { in: userIds } : undefined,
    date: { gte: toDate(from), lte: toDate(to) },
    ...(options?.search
      ? { OR: [{ task: { name: { contains: options.search, mode: "insensitive" } } }, { user: { name: { contains: options.search, mode: "insensitive" } } }] }
      : {}),
  };
  const include = {
    user: { select: { id: true, name: true } },
    task: { select: { id: true, taskNumber: true, name: true } },
  };
  const orderBy = { date: "asc" as const };

  if (!options) {
    return prisma.timesheetEntry.findMany({ where, include, orderBy });
  }
  const [items, total] = await Promise.all([
    prisma.timesheetEntry.findMany({ where, include, orderBy, skip: options.skip, take: options.take }),
    prisma.timesheetEntry.count({ where }),
  ]);
  return { items, total };
}
