import { ActivityLogStatus, ActivityType } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { AppError } from "../../utils/appError";

export interface CreateActivityLogInput {
  taskId: string;
  name?: string;
  activityType: ActivityType;
  status?: ActivityLogStatus;
  activityDate: string;
  timeIn?: string;
  timeOut?: string;
  workingHours?: number; // required when isManualOverride is true
  isManualOverride?: boolean;
  overrideReason?: string;
  feedback?: string;
}

function computeWorkingHours(input: {
  isManualOverride?: boolean;
  workingHours?: number;
  timeIn?: string;
  timeOut?: string;
}): number {
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

const activityLogInclude = { loggedBy: { select: { id: true, name: true } }, attachments: true };

// Shared by create/update/delete: adjusts (or creates/removes) the per-task
// TASK_WORK TimesheetEntry for a day by `deltaHours`.
async function adjustTaskWorkTimesheetEntry(userId: string, taskId: string, date: Date, deltaHours: number) {
  if (deltaHours === 0) return;
  const existingEntry = await prisma.timesheetEntry.findFirst({ where: { userId, date, taskId, entryType: "TASK_WORK" } });
  if (existingEntry) {
    const nextHours = Number(existingEntry.hoursLogged) + deltaHours;
    if (nextHours <= 0) {
      await prisma.timesheetEntry.delete({ where: { id: existingEntry.id } });
    } else {
      await prisma.timesheetEntry.update({ where: { id: existingEntry.id }, data: { hoursLogged: nextHours } });
    }
  } else if (deltaHours > 0) {
    await prisma.timesheetEntry.create({ data: { userId, date, taskId, entryType: "TASK_WORK", hoursLogged: deltaHours } });
  }
}

export async function createActivityLog(input: CreateActivityLogInput, loggedById: string) {
  const task = await prisma.task.findUnique({ where: { id: input.taskId } });
  if (!task) throw new AppError(404, "Task not found");

  const workingHours = computeWorkingHours(input);

  const activityLog = await prisma.activityLog.create({
    data: {
      taskId: input.taskId,
      name: input.name,
      activityType: input.activityType,
      status: input.status,
      activityDate: new Date(input.activityDate),
      timeIn: input.timeIn ? new Date(input.timeIn) : undefined,
      timeOut: input.timeOut ? new Date(input.timeOut) : undefined,
      workingHours,
      isManualOverride: input.isManualOverride ?? false,
      overrideReason: input.overrideReason,
      feedback: input.feedback,
      loggedById,
    },
    include: activityLogInclude,
  });

  // Timesheet auto-population: sum working hours per Task per Day (Section 5.7).
  await adjustTaskWorkTimesheetEntry(loggedById, input.taskId, startOfDay(input.activityDate), workingHours);

  return activityLog;
}

// Admin-only (enforced at the route level). The task an entry belongs to is
// fixed — only its other fields can change — so the Timesheet resync only
// ever has to reason about a hours/date change on the same task.
export async function updateActivityLog(id: string, input: Omit<CreateActivityLogInput, "taskId">) {
  const existing = await prisma.activityLog.findUnique({ where: { id } });
  if (!existing) throw new AppError(404, "Activity log entry not found");

  const newWorkingHours = computeWorkingHours(input);

  const updated = await prisma.activityLog.update({
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
      feedback: input.feedback ?? null,
    },
    include: activityLogInclude,
  });

  await adjustTaskWorkTimesheetEntry(existing.loggedById, existing.taskId, startOfDay(existing.activityDate.toISOString()), -Number(existing.workingHours));
  await adjustTaskWorkTimesheetEntry(existing.loggedById, existing.taskId, startOfDay(input.activityDate), newWorkingHours);

  return updated;
}

// Admin-only (enforced at the route level).
export async function deleteActivityLog(id: string) {
  const existing = await prisma.activityLog.findUnique({ where: { id } });
  if (!existing) throw new AppError(404, "Activity log entry not found");

  await adjustTaskWorkTimesheetEntry(existing.loggedById, existing.taskId, startOfDay(existing.activityDate.toISOString()), -Number(existing.workingHours));
  await prisma.activityLog.delete({ where: { id } });
}

export async function listActivityLogsForTask(taskId: string) {
  return prisma.activityLog.findMany({
    where: { taskId },
    include: activityLogInclude,
    orderBy: { activityDate: "desc" },
  });
}

export interface UploadedFileInfo {
  fileName: string;
  filePath: string;
  fileSize: number;
  mimeType: string;
}

export async function addActivityAttachments(activityLogId: string, files: UploadedFileInfo[]) {
  const activityLog = await prisma.activityLog.findUnique({ where: { id: activityLogId } });
  if (!activityLog) throw new AppError(404, "Activity log entry not found");
  return Promise.all(
    files.map((file) =>
      prisma.activityAttachment.create({
        data: { activityLogId, fileName: file.fileName, filePath: file.filePath, fileSize: file.fileSize, mimeType: file.mimeType },
      }),
    ),
  );
}
