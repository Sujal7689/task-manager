import { ActivityLogStatus, ActivityType, Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { AppError } from "../../utils/appError";
import { getVisibleTimesheetUserIds } from "../timesheets/timesheets.service";

interface AuthUser {
  id: string;
  role: string;
  departmentId: string | null;
  companyId: string | null;
}

export interface CreateDailyActivityInput {
  name?: string;
  activityType: ActivityType;
  status?: ActivityLogStatus;
  activityDate: string;
  timeIn?: string;
  timeOut?: string;
  workingHours?: number; // required when isManualOverride is true
  isManualOverride?: boolean;
  overrideReason?: string; // optional even for a manual override
  description?: string;
  projectId?: string;
  departmentId?: string;
}

function computeWorkingHours(input: CreateDailyActivityInput): number {
  if (input.isManualOverride) {
    if (input.workingHours == null) throw new AppError(400, "workingHours is required for a manual override");
    return input.workingHours;
  }
  if (!input.timeIn || !input.timeOut) {
    throw new AppError(400, "timeIn and timeOut are required unless using a manual override");
  }
  const diffMs = new Date(input.timeOut).getTime() - new Date(input.timeIn).getTime();
  if (diffMs <= 0) throw new AppError(400, "timeOut must be after timeIn");
  return Math.round((diffMs / (1000 * 60 * 60)) * 100) / 100;
}

function startOfDay(dateStr: string): Date {
  const d = new Date(dateStr);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

const dailyActivityInclude = {
  loggedBy: { select: { id: true, name: true } },
  project: { select: { id: true, name: true } },
  department: { select: { id: true, name: true } },
  attachments: true,
} satisfies Prisma.DailyActivityInclude;

// Shared by create/update/delete: adjusts (or creates/removes) the user's
// per-day ACTIVITY TimesheetEntry by `deltaHours` — positive to add a
// contribution, negative to reverse one. Keeps Timesheet totals accurate
// without ever needing Prisma's compound-unique upsert (which rejects an
// explicit `null` for the nullable taskId half of that key at runtime).
async function adjustActivityTimesheetEntry(userId: string, date: Date, deltaHours: number) {
  if (deltaHours === 0) return;
  const existingEntry = await prisma.timesheetEntry.findFirst({
    where: { userId, date, taskId: null, entryType: "ACTIVITY" },
  });
  if (existingEntry) {
    const nextHours = Number(existingEntry.hoursLogged) + deltaHours;
    if (nextHours <= 0) {
      await prisma.timesheetEntry.delete({ where: { id: existingEntry.id } });
    } else {
      await prisma.timesheetEntry.update({ where: { id: existingEntry.id }, data: { hoursLogged: nextHours } });
    }
  } else if (deltaHours > 0) {
    await prisma.timesheetEntry.create({ data: { userId, date, entryType: "ACTIVITY", hoursLogged: deltaHours } });
  }
}

export async function createDailyActivity(input: CreateDailyActivityInput, loggedById: string) {
  if (input.projectId) {
    const project = await prisma.project.findUnique({ where: { id: input.projectId }, select: { id: true } });
    if (!project) throw new AppError(400, "Project not found");
  }
  if (input.departmentId) {
    const department = await prisma.department.findUnique({ where: { id: input.departmentId }, select: { id: true } });
    if (!department) throw new AppError(400, "Department not found");
  }

  const workingHours = computeWorkingHours(input);

  const activity = await prisma.dailyActivity.create({
    data: {
      name: input.name,
      activityType: input.activityType,
      status: input.status,
      activityDate: new Date(input.activityDate),
      timeIn: input.timeIn ? new Date(input.timeIn) : undefined,
      timeOut: input.timeOut ? new Date(input.timeOut) : undefined,
      workingHours,
      isManualOverride: input.isManualOverride ?? false,
      overrideReason: input.overrideReason,
      description: input.description,
      projectId: input.projectId,
      departmentId: input.departmentId,
      loggedById,
    },
    include: dailyActivityInclude,
  });

  await adjustActivityTimesheetEntry(loggedById, startOfDay(input.activityDate), workingHours);

  return activity;
}

// Admin-only (enforced at the route level). Treated as a full replace of the
// same fields create() accepts — simpler and safer than partial-patch
// semantics given the Timesheet resync below has to reason about exactly
// what the old and new hour/date values were.
export async function updateDailyActivity(id: string, input: CreateDailyActivityInput) {
  const existing = await prisma.dailyActivity.findUnique({ where: { id } });
  if (!existing) throw new AppError(404, "Activity not found");

  if (input.projectId) {
    const project = await prisma.project.findUnique({ where: { id: input.projectId }, select: { id: true } });
    if (!project) throw new AppError(400, "Project not found");
  }
  if (input.departmentId) {
    const department = await prisma.department.findUnique({ where: { id: input.departmentId }, select: { id: true } });
    if (!department) throw new AppError(400, "Department not found");
  }

  const newWorkingHours = computeWorkingHours(input);

  const updated = await prisma.dailyActivity.update({
    where: { id },
    data: {
      name: input.name,
      activityType: input.activityType,
      status: input.status,
      activityDate: new Date(input.activityDate),
      timeIn: input.timeIn ? new Date(input.timeIn) : null,
      timeOut: input.timeOut ? new Date(input.timeOut) : null,
      workingHours: newWorkingHours,
      isManualOverride: input.isManualOverride ?? false,
      overrideReason: input.overrideReason ?? null,
      description: input.description ?? null,
      projectId: input.projectId ?? null,
      departmentId: input.departmentId ?? null,
    },
    include: dailyActivityInclude,
  });

  // Reverse the old contribution, then apply the new one — handles a changed
  // date correctly (old day loses the hours, new day gains them) as well as
  // a changed hour count on the same day.
  await adjustActivityTimesheetEntry(existing.loggedById, startOfDay(existing.activityDate.toISOString()), -Number(existing.workingHours));
  await adjustActivityTimesheetEntry(existing.loggedById, startOfDay(input.activityDate), newWorkingHours);

  return updated;
}

// Admin-only (enforced at the route level).
export async function deleteDailyActivity(id: string) {
  const existing = await prisma.dailyActivity.findUnique({ where: { id } });
  if (!existing) throw new AppError(404, "Activity not found");

  await adjustActivityTimesheetEntry(existing.loggedById, startOfDay(existing.activityDate.toISOString()), -Number(existing.workingHours));
  await prisma.dailyActivity.delete({ where: { id } });
}

export async function listMyDailyActivities(
  userId: string,
  filters: { from?: string; to?: string },
  options?: { skip: number; take: number },
) {
  const where: Prisma.DailyActivityWhereInput = {
    loggedById: userId,
    ...(filters.from || filters.to
      ? { activityDate: { gte: filters.from ? new Date(filters.from) : undefined, lte: filters.to ? new Date(filters.to) : undefined } }
      : {}),
  };
  const orderBy = { activityDate: "desc" as const };

  if (!options) {
    return prisma.dailyActivity.findMany({ where, include: dailyActivityInclude, orderBy });
  }
  const [items, total] = await Promise.all([
    prisma.dailyActivity.findMany({ where, include: dailyActivityInclude, orderBy, skip: options.skip, take: options.take }),
    prisma.dailyActivity.count({ where }),
  ]);
  return { items, total };
}

// Manager (department) / Team Lead (direct reports) / Admin (everyone) oversight
// view — same visibility rule already used for Team Timesheet.
export async function listTeamDailyActivities(
  user: AuthUser,
  filters: { from?: string; to?: string },
  options?: { skip: number; take: number },
) {
  const userIds = await getVisibleTimesheetUserIds(user);
  const where: Prisma.DailyActivityWhereInput = {
    loggedById: userIds ? { in: userIds } : undefined,
    ...(filters.from || filters.to
      ? { activityDate: { gte: filters.from ? new Date(filters.from) : undefined, lte: filters.to ? new Date(filters.to) : undefined } }
      : {}),
  };
  const orderBy = { activityDate: "desc" as const };

  if (!options) {
    return prisma.dailyActivity.findMany({ where, include: dailyActivityInclude, orderBy });
  }
  const [items, total] = await Promise.all([
    prisma.dailyActivity.findMany({ where, include: dailyActivityInclude, orderBy, skip: options.skip, take: options.take }),
    prisma.dailyActivity.count({ where }),
  ]);
  return { items, total };
}

export interface UploadedFileInfo {
  fileName: string;
  filePath: string;
  fileSize: number;
  mimeType: string;
}

export async function addDailyActivityAttachments(dailyActivityId: string, files: UploadedFileInfo[]) {
  const activity = await prisma.dailyActivity.findUnique({ where: { id: dailyActivityId } });
  if (!activity) throw new AppError(404, "Activity not found");
  return Promise.all(
    files.map((file) =>
      prisma.dailyActivityAttachment.create({
        data: { dailyActivityId, fileName: file.fileName, filePath: file.filePath, fileSize: file.fileSize, mimeType: file.mimeType },
      }),
    ),
  );
}
