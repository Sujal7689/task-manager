import { Request, Response } from "express";
import { z } from "zod";
import { Priority, RecurringFrequency, Role, TaskStatus } from "@prisma/client";
import * as service from "./tasks.service";
import { AppError } from "../../utils/appError";
import { parseCsv } from "../../utils/csv";

const taskSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  projectId: z.string().optional(),
  milestoneId: z.string().optional(),
  parentTaskId: z.string().optional(),
  categoryId: z.string().optional(),
  subCategoryId: z.string().optional(),
  priority: z.nativeEnum(Priority).optional(),
  tags: z.array(z.string()).optional(),
  startDate: z.string().optional(),
  dueDate: z.string().optional(),
  estimatedHours: z.number().optional(),
  isRecurring: z.boolean().optional(),
  recurringFrequency: z.nativeEnum(RecurringFrequency).optional(),
  companyId: z.string().optional(),
  departmentId: z.string().optional(),
  assigneeIds: z.array(z.string()).optional(),
  partyName: z.string().optional(),
  refId: z.string().optional(),
  status: z.nativeEnum(TaskStatus).optional(),
  percentComplete: z.number().min(0).max(100).optional(),
  closureRating: z.number().int().min(1).max(5).optional(),
});
const updateSchema = taskSchema.partial();
const progressSchema = z.object({
  status: z.nativeEnum(TaskStatus).optional(),
  percentComplete: z.number().min(0).max(100).optional(),
});

const listQuerySchema = z.object({
  projectId: z.string().optional(),
  milestoneId: z.string().optional(),
  status: z.nativeEnum(TaskStatus).optional(),
  assigneeId: z.string().optional(),
  assignedById: z.string().optional(),
  departmentId: z.string().optional(),
  companyId: z.string().optional(),
  categoryId: z.string().optional(),
  priority: z.nativeEnum(Priority).optional(),
  overdue: z.coerce.boolean().optional(),
  overdueDays: z.coerce.number().int().min(0).optional(),
  dueWithinDays: z.coerce.number().int().min(0).optional(),
  managerId: z.string().optional(),
});

export async function listHandler(req: Request, res: Response) {
  const query = listQuerySchema.parse(req.query);
  res.json(await service.listTasks(req.user!, query));
}

export async function getHandler(req: Request, res: Response) {
  res.json(await service.getTask(req.params.id, req.user!));
}

export async function createHandler(req: Request, res: Response) {
  const body = taskSchema.parse(req.body);
  res.status(201).json(await service.createTask(body, req.user!.id));
}

export async function updateHandler(req: Request, res: Response) {
  const body = updateSchema.parse(req.body);
  res.json(await service.updateTask(req.params.id, body));
}

// Staff may only update status/percentComplete, and only on tasks assigned to them.
export async function updateProgressHandler(req: Request, res: Response) {
  const body = progressSchema.parse(req.body);
  const isAssignee = await service.isTaskAssignee(req.params.id, req.user!.id);
  if (req.user!.role === Role.STAFF && !isAssignee) {
    throw new AppError(403, "You can only update tasks assigned to you");
  }
  res.json(await service.updateTaskProgress(req.params.id, body));
}

export async function deleteHandler(req: Request, res: Response) {
  await service.deleteTask(req.params.id);
  res.status(204).send();
}

export async function cloneHandler(req: Request, res: Response) {
  res.status(201).json(await service.cloneTask(req.params.id, req.user!.id));
}

export async function bulkImportHandler(req: Request, res: Response) {
  if (!req.file) throw new AppError(400, "No CSV file uploaded (field name: 'file')");
  const rows = parseCsv(req.file.buffer.toString("utf-8"));
  if (rows.length === 0) throw new AppError(400, "CSV has no data rows");
  res.json(await service.bulkCreateTasks(rows, req.user!.id));
}

export async function uploadAttachmentHandler(req: Request, res: Response) {
  if (!req.file) throw new AppError(400, "No file uploaded (field name: 'file')");
  await service.getTask(req.params.id, req.user!); // enforces the same RBAC visibility as viewing the task
  const attachment = await service.addTaskAttachment(req.params.id, {
    fileName: req.file.originalname,
    filePath: `uploads/tasks/${req.file.filename}`,
    fileSize: req.file.size,
    mimeType: req.file.mimetype,
  });
  res.status(201).json(attachment);
}

export async function deleteAttachmentHandler(req: Request, res: Response) {
  await service.deleteTaskAttachment(req.params.id, req.params.attachmentId);
  res.status(204).send();
}
