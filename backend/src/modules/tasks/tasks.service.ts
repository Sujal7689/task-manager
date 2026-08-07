import { Prisma, Priority, RecurringFrequency, TaskStatus, Role } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { AppError } from "../../utils/appError";
import { getDirectReportIds } from "../users/users.service";
import { notify } from "../notifications/notifications.service";

// Sub-tasks are tracked under their parent (Sub-tasks tab) rather than as
// independent items, so dashboards/KPIs/progress rollups count top-level
// tasks only — a sub-task's completion shouldn't double-count alongside
// the parent task it belongs to.
export const topLevelTaskFilter: Prisma.TaskWhereInput = { parentTaskId: null };

const taskInclude = {
  project: { select: { id: true, name: true } },
  milestone: { select: { id: true, name: true } },
  parentTask: { select: { id: true, taskNumber: true, name: true } },
  subTasks: {
    select: {
      id: true,
      taskNumber: true,
      name: true,
      status: true,
      assignees: { include: { user: { select: { id: true, name: true } } } },
    },
  },
  category: true,
  subCategory: true,
  department: { select: { id: true, name: true } },
  assignedBy: { select: { id: true, name: true } },
  assignees: { include: { user: { select: { id: true, name: true, email: true } } } },
  attachments: true,
} satisfies Prisma.TaskInclude;

interface AuthUser {
  id: string;
  role: Role;
  departmentId: string | null;
  companyId: string | null;
}

// Role-scoped visibility (Section 4). Team Lead's "team" = direct reports,
// per the reporting-manager-based scoping decision (no Team entity in Section 5).
export async function getTaskScopeWhere(user: AuthUser): Promise<Prisma.TaskWhereInput> {
  switch (user.role) {
    case Role.ADMIN:
      return {};
    case Role.MANAGER:
      // Task.departmentId is optional and rarely set directly (the Task form
      // doesn't expose it) — most tasks only carry a department via their
      // Project, which always has one. Match on either so Managers actually
      // see their department's tasks instead of only the rare directly-tagged ones.
      return user.departmentId
        ? { OR: [{ departmentId: user.departmentId }, { project: { departmentId: user.departmentId } }] }
        : {};
    case Role.TEAM_LEAD: {
      const directReportIds = await getDirectReportIds(user.id);
      return {
        OR: [
          { assignedById: user.id },
          { assignees: { some: { userId: user.id } } },
          { assignees: { some: { userId: { in: directReportIds } } } },
        ],
      };
    }
    case Role.STAFF:
    default:
      // Staff can now create tasks too, so visibility has to include tasks
      // they created — not just ones assigned to them — or a Staff member
      // immediately loses access to a task the moment they create it.
      return { OR: [{ assignedById: user.id }, { assignees: { some: { userId: user.id } } }] };
  }
}

async function generateTaskNumber(): Promise<string> {
  const prefix = "T-";
  const count = await prisma.task.count({ where: { taskNumber: { startsWith: prefix } } });
  return `${prefix}${String(count + 1).padStart(4, "0")}`;
}

// Shared filter set for both the interactive Task List and the Task Detail
// Report (Reports page) — the "drill down to tasks" query engine used
// everywhere a dashboard/report number needs to become a real task list.
export interface TaskFilterInput {
  projectId?: string;
  milestoneId?: string;
  status?: TaskStatus;
  assigneeId?: string; // "Assigned To"
  assignedById?: string; // "Assigned From"
  departmentId?: string;
  companyId?: string;
  categoryId?: string;
  priority?: Priority;
  overdue?: boolean;
  overdueDays?: number; // minimum days overdue; implies overdue
  dueWithinDays?: number; // due between now and now+N days (e.g. 0 = "due today", 7 = "due this week")
  managerId?: string; // "team" — tasks assigned to this manager's direct reports (+ self)
  search?: string; // free-text match against task number or name
}

export async function buildTaskFilterWhere(filters: TaskFilterInput): Promise<Prisma.TaskWhereInput[]> {
  const clauses: Prisma.TaskWhereInput[] = [];

  if (filters.projectId) clauses.push({ projectId: filters.projectId });
  if (filters.milestoneId) clauses.push({ milestoneId: filters.milestoneId });
  if (filters.status) clauses.push({ status: filters.status });
  if (filters.categoryId) clauses.push({ categoryId: filters.categoryId });
  if (filters.priority) clauses.push({ priority: filters.priority });
  if (filters.assigneeId) clauses.push({ assignees: { some: { userId: filters.assigneeId } } });
  if (filters.assignedById) clauses.push({ assignedById: filters.assignedById });

  // Task.departmentId/companyId are optional and rarely set directly — most
  // tasks only carry these via their Project, which always has them.
  if (filters.departmentId) {
    clauses.push({ OR: [{ departmentId: filters.departmentId }, { project: { departmentId: filters.departmentId } }] });
  }
  if (filters.companyId) {
    clauses.push({ OR: [{ companyId: filters.companyId }, { project: { companyId: filters.companyId } }] });
  }

  if (filters.search) {
    clauses.push({
      OR: [
        { name: { contains: filters.search, mode: "insensitive" } },
        { taskNumber: { contains: filters.search, mode: "insensitive" } },
      ],
    });
  }

  if (filters.managerId) {
    const directReportIds = await getDirectReportIds(filters.managerId);
    clauses.push({ assignees: { some: { userId: { in: [...directReportIds, filters.managerId] } } } });
  }

  if (filters.overdueDays != null) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - filters.overdueDays);
    clauses.push({ dueDate: { lt: cutoff }, status: { notIn: ["COMPLETED", "CANCELLED"] } });
  } else if (filters.overdue) {
    clauses.push({ dueDate: { lt: new Date() }, status: { notIn: ["COMPLETED", "CANCELLED"] } });
  }

  if (filters.dueWithinDays != null) {
    const now = new Date();
    const end = new Date(now);
    end.setDate(end.getDate() + filters.dueWithinDays);
    end.setHours(23, 59, 59, 999);
    clauses.push({ dueDate: { gte: now, lte: end }, status: { notIn: ["COMPLETED", "CANCELLED"] } });
  }

  return clauses;
}

// Allowlist only — sortBy comes from user-controlled query params, so it must
// map through a fixed set of Prisma orderBy shapes rather than being used directly.
export const taskSortFields = [
  "taskNumber",
  "name",
  "project",
  "milestone",
  "department",
  "dueDate",
  "priority",
  "status",
  "percentComplete",
  "createdAt",
] as const;
export type TaskSortField = (typeof taskSortFields)[number];

function taskOrderBy(sortBy?: TaskSortField, sortDir: "asc" | "desc" = "asc"): Prisma.TaskOrderByWithRelationInput {
  switch (sortBy) {
    case "project":
      return { project: { name: sortDir } };
    case "milestone":
      return { milestone: { name: sortDir } };
    case "department":
      return { department: { name: sortDir } };
    case "taskNumber":
    case "name":
    case "dueDate":
    case "priority":
    case "status":
    case "percentComplete":
    case "createdAt":
      return { [sortBy]: sortDir };
    default:
      return { createdAt: "desc" };
  }
}

export async function listTasks(
  user: AuthUser,
  filters: TaskFilterInput,
  page?: { skip: number; take: number },
  sort?: { field?: TaskSortField; dir?: "asc" | "desc" },
) {
  const scope = await getTaskScopeWhere(user);
  const filterClauses = await buildTaskFilterWhere(filters);
  const where: Prisma.TaskWhereInput = { AND: [scope, ...filterClauses] };
  const orderBy = taskOrderBy(sort?.field, sort?.dir);
  if (!page) {
    return prisma.task.findMany({ where, include: taskInclude, orderBy });
  }
  const [items, total] = await Promise.all([
    prisma.task.findMany({ where, include: taskInclude, orderBy, skip: page.skip, take: page.take }),
    prisma.task.count({ where }),
  ]);
  return { items, total };
}

export async function getTask(id: string, user: AuthUser) {
  const task = await prisma.task.findUnique({ where: { id }, include: taskInclude });
  if (!task) throw new AppError(404, "Task not found");

  const scope = await getTaskScopeWhere(user);
  const visible = await prisma.task.findFirst({ where: { AND: [{ id }, scope] } });
  if (!visible) throw new AppError(403, "You do not have access to this task");

  return task;
}

export interface TaskInput {
  name: string;
  description?: string;
  projectId?: string;
  milestoneId?: string;
  parentTaskId?: string;
  categoryId?: string;
  subCategoryId?: string;
  priority?: Priority;
  tags?: string[];
  startDate?: string;
  dueDate?: string;
  estimatedHours?: number;
  isRecurring?: boolean;
  recurringFrequency?: RecurringFrequency;
  companyId?: string;
  departmentId?: string;
  assigneeIds?: string[];
  partyName?: string;
  refId?: string;
  status?: TaskStatus;
  percentComplete?: number;
  closureRating?: number;
}

function closedAtPatch(previousStatus: TaskStatus, nextStatus?: TaskStatus) {
  if (nextStatus === "COMPLETED" && previousStatus !== "COMPLETED") return new Date();
  return undefined;
}

async function resolveHierarchy(input: TaskInput) {
  let { projectId, milestoneId, departmentId } = input;

  if (milestoneId) {
    const milestone = await prisma.milestone.findUnique({ where: { id: milestoneId } });
    if (!milestone) throw new AppError(400, "Milestone not found");
    projectId = projectId ?? milestone.projectId;
  }

  if (input.parentTaskId) {
    const parent = await prisma.task.findUnique({ where: { id: input.parentTaskId } });
    if (!parent) throw new AppError(400, "Parent task not found");
    // Sub-tasks are one level deep only — a sub-task cannot itself be a parent.
    if (parent.parentTaskId) throw new AppError(400, "A sub-task cannot have its own sub-tasks");
    projectId = projectId ?? parent.projectId ?? undefined;
    milestoneId = milestoneId ?? parent.milestoneId ?? undefined;
    // A sub-task belongs to the same department as its parent unless overridden.
    departmentId = departmentId ?? parent.departmentId ?? undefined;
  }

  if (!projectId && !input.parentTaskId) {
    throw new AppError(400, "A task must belong to a Project or Milestone, or be a sub-task of another Task");
  }

  return { projectId, milestoneId, departmentId };
}

export async function createTask(input: TaskInput, assignedById: string) {
  const { projectId, milestoneId, departmentId } = await resolveHierarchy(input);
  const taskNumber = await generateTaskNumber();

  const task = await prisma.task.create({
    data: {
      taskNumber,
      name: input.name,
      description: input.description,
      projectId,
      milestoneId,
      parentTaskId: input.parentTaskId,
      categoryId: input.categoryId,
      subCategoryId: input.subCategoryId,
      priority: input.priority,
      tags: input.tags ?? [],
      startDate: input.startDate ? new Date(input.startDate) : undefined,
      dueDate: input.dueDate ? new Date(input.dueDate) : undefined,
      estimatedHours: input.estimatedHours,
      isRecurring: input.isRecurring ?? false,
      recurringFrequency: input.recurringFrequency,
      companyId: input.companyId,
      departmentId,
      assignedById,
      partyName: input.partyName,
      refId: input.refId,
      status: input.status,
      percentComplete: input.percentComplete,
      closureRating: input.closureRating,
      closedAt: closedAtPatch("NOT_STARTED", input.status),
      assignees: input.assigneeIds?.length
        ? { create: input.assigneeIds.map((userId) => ({ userId })) }
        : undefined,
    },
    include: taskInclude,
  });

  // New task assigned (Section 6.9): notify every assignee, in-app + email.
  for (const userId of input.assigneeIds ?? []) {
    await notify({
      recipientId: userId,
      type: "TASK_ASSIGNED",
      message: `You were assigned to ${task.taskNumber} — ${task.name}`,
      taskId: task.id,
      sendEmailToo: true,
    });
  }

  return task;
}

// A sub-task counts as "resolved" for its parent's completion gate whether it
// was finished or explicitly cancelled — cancelled work shouldn't permanently
// block the parent.
function hasUnresolvedSubTasks(subTasks: { status: TaskStatus }[]): boolean {
  return subTasks.some((st) => st.status !== "COMPLETED" && st.status !== "CANCELLED");
}

export async function updateTask(id: string, input: Partial<TaskInput>) {
  const existing = await prisma.task.findUnique({
    where: { id },
    include: { assignees: true, subTasks: { select: { status: true } } },
  });
  if (!existing) throw new AppError(404, "Task not found");

  if (input.status === "COMPLETED" && existing.status !== "COMPLETED" && hasUnresolvedSubTasks(existing.subTasks)) {
    throw new AppError(400, "All sub-tasks must be completed (or cancelled) before this task can be marked Completed");
  }

  // Sub-tasks are one level deep only, enforced on update too (createTask's
  // check alone wouldn't stop someone re-parenting an existing task via PATCH).
  if (input.parentTaskId) {
    if (input.parentTaskId === id) throw new AppError(400, "A task cannot be its own parent");
    const newParent = await prisma.task.findUnique({ where: { id: input.parentTaskId } });
    if (!newParent) throw new AppError(400, "Parent task not found");
    if (newParent.parentTaskId) throw new AppError(400, "A sub-task cannot have its own sub-tasks");
    if (existing.subTasks.length > 0) throw new AppError(400, "A task with existing sub-tasks cannot itself become a sub-task");
  }

  let projectId = input.projectId ?? existing.projectId ?? undefined;
  let milestoneId = input.milestoneId ?? existing.milestoneId ?? undefined;
  if (input.milestoneId) {
    const milestone = await prisma.milestone.findUnique({ where: { id: input.milestoneId } });
    if (!milestone) throw new AppError(400, "Milestone not found");
    projectId = input.projectId ?? milestone.projectId;
  }

  const previousAssigneeIds = new Set(existing.assignees.map((a) => a.userId));

  const updated = await prisma.task.update({
    where: { id },
    data: {
      name: input.name,
      description: input.description,
      projectId,
      milestoneId,
      parentTaskId: input.parentTaskId,
      categoryId: input.categoryId,
      subCategoryId: input.subCategoryId,
      priority: input.priority,
      tags: input.tags,
      startDate: input.startDate ? new Date(input.startDate) : undefined,
      dueDate: input.dueDate ? new Date(input.dueDate) : undefined,
      estimatedHours: input.estimatedHours,
      isRecurring: input.isRecurring,
      recurringFrequency: input.recurringFrequency,
      companyId: input.companyId,
      departmentId: input.departmentId,
      partyName: input.partyName,
      refId: input.refId,
      status: input.status,
      percentComplete: input.percentComplete,
      closureRating: input.closureRating,
      closedAt: closedAtPatch(existing.status, input.status),
      assignees: input.assigneeIds
        ? { deleteMany: {}, create: input.assigneeIds.map((userId) => ({ userId })) }
        : undefined,
    },
    include: taskInclude,
  });

  if (input.assigneeIds) {
    const newlyAssigned = input.assigneeIds.filter((userId) => !previousAssigneeIds.has(userId));
    for (const userId of newlyAssigned) {
      await notify({
        recipientId: userId,
        type: "TASK_ASSIGNED",
        message: `You were assigned to ${updated.taskNumber} — ${updated.name}`,
        taskId: updated.id,
        sendEmailToo: true,
      });
    }
  }

  if (input.status && input.status !== existing.status) {
    await notify({
      recipientId: existing.assignedById,
      type: "TASK_STATUS_CHANGED",
      message: `${updated.taskNumber} — ${updated.name} status changed to ${input.status.replace("_", " ")}`,
      taskId: updated.id,
    });
  }

  return updated;
}

// Restricted update available to Staff on tasks assigned to them: status + % complete only.
export async function updateTaskProgress(id: string, data: { status?: TaskStatus; percentComplete?: number }) {
  const existing = await prisma.task.findUnique({ where: { id }, include: { subTasks: { select: { status: true } } } });
  if (!existing) throw new AppError(404, "Task not found");

  if (data.status === "COMPLETED" && existing.status !== "COMPLETED" && hasUnresolvedSubTasks(existing.subTasks)) {
    throw new AppError(400, "All sub-tasks must be completed (or cancelled) before this task can be marked Completed");
  }

  const updated = await prisma.task.update({
    where: { id },
    data: { ...data, closedAt: closedAtPatch(existing.status, data.status) },
    include: taskInclude,
  });

  if (data.status && data.status !== existing.status) {
    await notify({
      recipientId: existing.assignedById,
      type: "TASK_STATUS_CHANGED",
      message: `${updated.taskNumber} — ${updated.name} status changed to ${data.status.replace("_", " ")}`,
      taskId: updated.id,
    });
  }

  return updated;
}

export async function deleteTask(id: string) {
  const existing = await prisma.task.findUnique({ where: { id } });
  if (!existing) throw new AppError(404, "Task not found");
  await prisma.task.delete({ where: { id } });
}

export async function isTaskAssignee(taskId: string, userId: string): Promise<boolean> {
  const assignment = await prisma.taskAssignee.findUnique({ where: { taskId_userId: { taskId, userId } } });
  return Boolean(assignment);
}

// Section 6.2: bulk task upload (CSV/Excel import). Expected CSV columns:
// name (required), projectId, milestoneId, departmentId (required), priority,
// dueDate (YYYY-MM-DD), estimatedHours, assigneeEmails ("a@x.com;b@x.com"),
// partyName, refId, tags ("a;b"). See GET /tasks/bulk-import/template.
export interface BulkImportRow {
  name?: string;
  projectId?: string;
  milestoneId?: string;
  departmentId?: string;
  priority?: string;
  dueDate?: string;
  estimatedHours?: string;
  assigneeEmails?: string;
  partyName?: string;
  refId?: string;
  tags?: string;
}

export interface BulkImportResult {
  created: number;
  errors: { row: number; message: string }[];
}

export async function bulkCreateTasks(rows: BulkImportRow[], assignedById: string): Promise<BulkImportResult> {
  const result: BulkImportResult = { created: 0, errors: [] };

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    try {
      if (!row.name?.trim()) throw new AppError(400, "Missing required 'name' column");
      if (!row.departmentId?.trim()) throw new AppError(400, "Missing required 'departmentId' column");
      if (row.projectId?.trim() && !row.milestoneId?.trim()) {
        throw new AppError(400, "'milestoneId' is required when 'projectId' is set");
      }

      let assigneeIds: string[] = [];
      if (row.assigneeEmails?.trim()) {
        const emails = row.assigneeEmails.split(/[;,]/).map((e) => e.trim()).filter(Boolean);
        const matched = await prisma.user.findMany({ where: { email: { in: emails } }, select: { id: true } });
        assigneeIds = matched.map((u) => u.id);
      }

      await createTask(
        {
          name: row.name.trim(),
          projectId: row.projectId?.trim() || undefined,
          milestoneId: row.milestoneId?.trim() || undefined,
          departmentId: row.departmentId.trim(),
          priority: (row.priority?.trim().toUpperCase() as Priority) || undefined,
          dueDate: row.dueDate?.trim() || undefined,
          estimatedHours: row.estimatedHours ? Number(row.estimatedHours) : undefined,
          assigneeIds,
          partyName: row.partyName?.trim() || undefined,
          refId: row.refId?.trim() || undefined,
          tags: row.tags?.trim() ? row.tags.split(/[;,]/).map((t) => t.trim()).filter(Boolean) : undefined,
        },
        assignedById,
      );
      result.created++;
    } catch (err) {
      result.errors.push({ row: i + 2, message: err instanceof AppError ? err.message : "Failed to create task" }); // +2: header row + 1-index
    }
  }

  return result;
}

export interface UploadedFileInfo {
  fileName: string;
  filePath: string;
  fileSize: number;
  mimeType: string;
}

export async function addTaskAttachment(taskId: string, file: UploadedFileInfo) {
  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task) throw new AppError(404, "Task not found");
  return prisma.taskAttachment.create({
    data: { taskId, fileName: file.fileName, filePath: file.filePath, fileSize: file.fileSize, mimeType: file.mimeType },
  });
}

export async function deleteTaskAttachment(taskId: string, attachmentId: string) {
  const attachment = await prisma.taskAttachment.findUnique({ where: { id: attachmentId } });
  if (!attachment || attachment.taskId !== taskId) throw new AppError(404, "Attachment not found");
  await prisma.taskAttachment.delete({ where: { id: attachmentId } });
}

// Section 6.2: task cloning for recurring work. Copies classification/scheduling/
// assignment fields but resets progress and closure state on the new task.
export async function cloneTask(id: string, assignedById: string) {
  const source = await prisma.task.findUnique({ where: { id }, include: { assignees: true } });
  if (!source) throw new AppError(404, "Task not found");

  return createTask(
    {
      name: `Copy of ${source.name}`,
      description: source.description ?? undefined,
      projectId: source.projectId ?? undefined,
      milestoneId: source.milestoneId ?? undefined,
      categoryId: source.categoryId ?? undefined,
      subCategoryId: source.subCategoryId ?? undefined,
      priority: source.priority,
      tags: source.tags,
      estimatedHours: source.estimatedHours ? Number(source.estimatedHours) : undefined,
      isRecurring: source.isRecurring,
      recurringFrequency: source.recurringFrequency ?? undefined,
      companyId: source.companyId ?? undefined,
      departmentId: source.departmentId ?? undefined,
      assigneeIds: source.assignees.map((a) => a.userId),
      partyName: source.partyName ?? undefined,
    },
    assignedById,
  );
}
