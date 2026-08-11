import { ActivityLogStatus, ActivityType } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { AppError } from "../../utils/appError";

export interface CreateActivityLogInput {
  taskId: string;
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

function computeWorkingHours(input: CreateActivityLogInput): number {
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

export async function createActivityLog(input: CreateActivityLogInput, loggedById: string) {
  const task = await prisma.task.findUnique({ where: { id: input.taskId } });
  if (!task) throw new AppError(404, "Task not found");

  const workingHours = computeWorkingHours(input);

  const activityLog = await prisma.activityLog.create({
    data: {
      taskId: input.taskId,
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
    include: { loggedBy: { select: { id: true, name: true } }, attachments: true },
  });

  // Timesheet auto-population: sum working hours per Task per Day (Section 5.7).
  const date = startOfDay(input.activityDate);
  await prisma.timesheetEntry.upsert({
    where: {
      userId_date_taskId_entryType: {
        userId: loggedById,
        date,
        taskId: input.taskId,
        entryType: "TASK_WORK",
      },
    },
    update: { hoursLogged: { increment: workingHours } },
    create: {
      userId: loggedById,
      date,
      taskId: input.taskId,
      entryType: "TASK_WORK",
      hoursLogged: workingHours,
    },
  });

  return activityLog;
}

export async function listActivityLogsForTask(taskId: string) {
  return prisma.activityLog.findMany({
    where: { taskId },
    include: { loggedBy: { select: { id: true, name: true } }, attachments: true },
    orderBy: { activityDate: "desc" },
  });
}

export interface UploadedFileInfo {
  fileName: string;
  filePath: string;
  fileSize: number;
  mimeType: string;
}

export async function addActivityAttachment(activityLogId: string, file: UploadedFileInfo) {
  const activityLog = await prisma.activityLog.findUnique({ where: { id: activityLogId } });
  if (!activityLog) throw new AppError(404, "Activity log entry not found");
  return prisma.activityAttachment.create({
    data: { activityLogId, fileName: file.fileName, filePath: file.filePath, fileSize: file.fileSize, mimeType: file.mimeType },
  });
}
