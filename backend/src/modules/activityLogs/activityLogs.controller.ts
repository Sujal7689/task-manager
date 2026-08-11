import { Request, Response } from "express";
import { z } from "zod";
import { ActivityLogStatus, ActivityType } from "@prisma/client";
import * as service from "./activityLogs.service";
import * as tasksService from "../tasks/tasks.service";
import { AppError } from "../../utils/appError";

const createSchema = z.object({
  taskId: z.string().min(1),
  name: z.string().optional(),
  activityType: z.nativeEnum(ActivityType),
  status: z.nativeEnum(ActivityLogStatus).optional(),
  activityDate: z.string().min(1),
  timeIn: z.string().optional(),
  timeOut: z.string().optional(),
  workingHours: z.number().optional(),
  isManualOverride: z.boolean().optional(),
  overrideReason: z.string().optional(),
  feedback: z.string().optional(),
});
const updateSchema = createSchema.omit({ taskId: true });

export async function createHandler(req: Request, res: Response) {
  const body = createSchema.parse(req.body);
  // Reuses Task RBAC scoping — only users who can see the task may log activity against it.
  await tasksService.getTask(body.taskId, req.user!);
  res.status(201).json(await service.createActivityLog(body, req.user!.id));
}

export async function updateHandler(req: Request, res: Response) {
  const body = updateSchema.parse(req.body);
  res.json(await service.updateActivityLog(req.params.id, body));
}

export async function deleteHandler(req: Request, res: Response) {
  await service.deleteActivityLog(req.params.id);
  res.status(204).send();
}

export async function listForTaskHandler(req: Request, res: Response) {
  await tasksService.getTask(req.params.taskId, req.user!);
  res.json(await service.listActivityLogsForTask(req.params.taskId));
}

export async function uploadAttachmentHandler(req: Request, res: Response) {
  if (!req.file) throw new AppError(400, "No file uploaded (field name: 'file')");
  const attachment = await service.addActivityAttachment(req.params.id, {
    fileName: req.file.originalname,
    filePath: `uploads/activity-logs/${req.file.filename}`,
    fileSize: req.file.size,
    mimeType: req.file.mimetype,
  });
  res.status(201).json(attachment);
}
