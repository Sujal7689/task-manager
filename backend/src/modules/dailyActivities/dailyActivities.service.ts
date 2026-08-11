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

  // Folds into the user's Timesheet total under a dedicated ACTIVITY bucket.
  // Add-to-existing rather than one row per activity, since the underlying
  // TimesheetEntry is uniquely keyed on (userId, date, taskId, entryType) —
  // a plain create would collide the moment a second activity is logged on
  // the same day. Can't use Prisma's compound-unique `upsert` here: it
  // rejects an explicit `null` for the (nullable) taskId column of that key
  // at runtime, so this looks the row up and creates/updates manually instead.
  const date = startOfDay(input.activityDate);
  const existingEntry = await prisma.timesheetEntry.findFirst({
    where: { userId: loggedById, date, taskId: null, entryType: "ACTIVITY" },
    select: { id: true },
  });
  if (existingEntry) {
    await prisma.timesheetEntry.update({ where: { id: existingEntry.id }, data: { hoursLogged: { increment: workingHours } } });
  } else {
    await prisma.timesheetEntry.create({ data: { userId: loggedById, date, entryType: "ACTIVITY", hoursLogged: workingHours } });
  }

  return activity;
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

export async function addDailyActivityAttachment(dailyActivityId: string, file: UploadedFileInfo) {
  const activity = await prisma.dailyActivity.findUnique({ where: { id: dailyActivityId } });
  if (!activity) throw new AppError(404, "Activity not found");
  return prisma.dailyActivityAttachment.create({
    data: { dailyActivityId, fileName: file.fileName, filePath: file.filePath, fileSize: file.fileSize, mimeType: file.mimeType },
  });
}
