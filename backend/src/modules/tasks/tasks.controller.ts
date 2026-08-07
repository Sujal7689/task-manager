import { Request, Response } from "express";
import { z } from "zod";
import { Priority, RecurringFrequency, Role, TaskStatus } from "@prisma/client";
import * as service from "./tasks.service";
import { AppError } from "../../utils/appError";
import { parseCsv, toCsv } from "../../utils/csv";
import { parsePagination, toPaginated } from "../../utils/pagination";

const taskBaseSchema = z.object({
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

// A sub-task (parentTaskId set) inherits its Project/Milestone from the
// parent, so this only applies to top-level tasks: picking a Project without
// a Milestone is how tasks were silently going invisible on the Project/
// Milestone detail pages (they only ever render tasks nested under a Milestone).
function requiresMilestoneWithProject(data: { projectId?: string; milestoneId?: string; parentTaskId?: string }) {
  return !data.projectId || Boolean(data.parentTaskId) || Boolean(data.milestoneId);
}
const milestoneRequiredIssue = { message: "Milestone is required when a Project is selected", path: ["milestoneId"] };

// Every task is tagged with the department it belongs to; a sub-task
// (parentTaskId set) inherits its parent's department instead of asking again.
// Only applies to creation — a top-level task must be given one up front.
function requiresDepartmentOnCreate(data: { departmentId?: string; parentTaskId?: string }) {
  return Boolean(data.parentTaskId) || Boolean(data.departmentId);
}
// On update, only relevant if departmentId is actually present in this
// request — a partial edit that doesn't touch it (e.g. just changing status)
// shouldn't be forced to resend a field it isn't changing.
function requiresDepartmentOnUpdate(data: { departmentId?: string | null; parentTaskId?: string }) {
  if (!("departmentId" in data)) return true;
  return Boolean(data.parentTaskId) || Boolean(data.departmentId);
}
const departmentRequiredIssue = { message: "Department is required", path: ["departmentId"] };

const taskSchema = taskBaseSchema
  .refine(requiresMilestoneWithProject, milestoneRequiredIssue)
  .refine(requiresDepartmentOnCreate, departmentRequiredIssue);
const updateSchema = taskBaseSchema
  .partial()
  .refine(requiresMilestoneWithProject, milestoneRequiredIssue)
  .refine(requiresDepartmentOnUpdate, departmentRequiredIssue);
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
  search: z.string().optional(),
  sortBy: z.enum(service.taskSortFields).optional(),
  sortDir: z.enum(["asc", "desc"]).optional(),
});

export async function listHandler(req: Request, res: Response) {
  const { sortBy, sortDir, ...query } = listQuerySchema.parse(req.query);
  const sort = { field: sortBy, dir: sortDir };
  const pagination = parsePagination(req.query);
  if (!pagination) {
    return res.json(await service.listTasks(req.user!, query, undefined, sort));
  }
  const { items, total } = (await service.listTasks(req.user!, query, pagination, sort)) as { items: unknown[]; total: number };
  res.json(toPaginated(items, total, pagination.page, pagination.pageSize));
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

// Downloadable starter CSV matching bulkImportHandler's expected columns exactly —
// projectId/milestoneId/departmentId are internal IDs (visible in each entity's
// list/detail page URL), not names.
export async function bulkImportTemplateHandler(_req: Request, res: Response) {
  const csv = toCsv([
    {
      name: "Design homepage mockup",
      projectId: "",
      milestoneId: "",
      departmentId: "",
      priority: "MEDIUM",
      dueDate: "2026-12-31",
      estimatedHours: "8",
      assigneeEmails: "jane@example.com;john@example.com",
      partyName: "",
      refId: "",
      tags: "design;urgent",
    },
  ]);
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", 'attachment; filename="task-import-template.csv"');
  res.send(csv);
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
