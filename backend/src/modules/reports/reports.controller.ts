import { Request, Response } from "express";
import { z } from "zod";
import { Priority, TaskStatus, TimesheetEntryType } from "@prisma/client";
import * as service from "./reports.service";
import * as kpiService from "../kpi/kpi.service";
import { getVisibleMemberIds } from "../users/users.service";
import { AppError } from "../../utils/appError";
import { toCsv } from "../../utils/csv";
import { parsePagination, toPaginated } from "../../utils/pagination";

const filtersSchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  departmentId: z.string().optional(),
  categoryId: z.string().optional(),
  status: z.nativeEnum(TaskStatus).optional(),
  format: z.enum(["json", "csv"]).default("json"),
});

const groupedFiltersSchema = filtersSchema.extend({
  groupBy: z.enum(["employee", "team", "project", "company", "department"]),
  companyId: z.string().optional(),
  projectId: z.string().optional(),
  employeeId: z.string().optional(),
});

// Full drill-down filter set, shared in spirit with the Task List's query params.
const taskDetailFiltersSchema = filtersSchema.extend({
  projectId: z.string().optional(),
  milestoneId: z.string().optional(),
  assigneeId: z.string().optional(),
  assignedById: z.string().optional(),
  companyId: z.string().optional(),
  priority: z.nativeEnum(Priority).optional(),
  overdue: z.coerce.boolean().optional(),
  overdueDays: z.coerce.number().int().min(0).optional(),
  managerId: z.string().optional(),
  search: z.string().optional(),
});

const timesheetFiltersSchema = z.object({
  employeeId: z.string().optional(),
  taskId: z.string().optional(),
  projectId: z.string().optional(),
  milestoneId: z.string().optional(),
  departmentId: z.string().optional(),
  companyId: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  entryType: z.nativeEnum(TimesheetEntryType).optional(),
  format: z.enum(["json", "csv"]).default("json"),
});

const timesheetSummaryFiltersSchema = timesheetFiltersSchema.extend({
  groupBy: z.enum(["employee", "task", "project", "department"]),
});

const kpiReportFiltersSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  companyId: z.string().optional(),
  departmentId: z.string().optional(),
  projectId: z.string().optional(),
  milestoneId: z.string().optional(),
  employeeId: z.string().optional(),
  format: z.enum(["json", "csv"]).default("json"),
});

function respond(res: Response, rows: Record<string, unknown>[], format: "json" | "csv", filename: string) {
  if (format === "csv") {
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}.csv"`);
    return res.send(toCsv(rows));
  }
  return res.json(rows);
}

export async function taskDetailHandler(req: Request, res: Response) {
  const filters = taskDetailFiltersSchema.parse(req.query);

  // CSV export always fetches the full unpaginated set (a report export
  // should never be silently truncated to one page); only the on-screen
  // JSON table paginates.
  if (filters.format === "csv") {
    const tasks = await service.taskDetailReportAll(req.user!, filters);
    const rows = tasks.map((t) => ({
      taskNumber: t.taskNumber,
      name: t.name,
      project: t.project?.name ?? "",
      milestone: t.milestone?.name ?? "",
      department: t.department?.name ?? "",
      category: t.category?.name ?? "",
      priority: t.priority,
      status: t.status,
      percentComplete: t.percentComplete,
      dueDate: t.dueDate?.toISOString() ?? "",
      assignedBy: t.assignedBy?.name ?? "",
      assignees: t.assignees.map((a) => a.user.name).join("; "),
      estimatedHours: t.estimatedHours ?? "",
      spentHours: t.spentHours,
    }));
    return respond(res, rows, "csv", "task-detail-report");
  }

  const pagination = parsePagination(req.query);
  if (!pagination) {
    return res.json(await service.taskDetailReportAll(req.user!, filters));
  }
  const { items, total } = await service.taskDetailReportPage(req.user!, filters, pagination);
  res.json(toPaginated(items, total, pagination.page, pagination.pageSize));
}

export async function groupedHandler(req: Request, res: Response) {
  const filters = groupedFiltersSchema.parse(req.query);
  const rows = await service.groupedTaskReport(req.user!, filters);
  respond(res, rows as unknown as Record<string, unknown>[], filters.format, `task-report-by-${filters.groupBy}`);
}

export async function taskSummaryHandler(req: Request, res: Response) {
  const filters = filtersSchema.parse(req.query);
  res.json(await service.taskSummaryReport(req.user!, filters));
}

// Anyone can view their own performance/timesheet — but viewing SOMEONE
// ELSE'S requires the requester to actually have visibility over that
// person (Admin=all, Manager=org-wide staff/TL, Team Lead=direct reports),
// same rule as every other team-scoped report. Previously unchecked: any
// authenticated user (including Staff) could pass `?userId=<anyone>` and
// read that person's KPI trend or full timesheet — fixed here rather than
// route-gating with `managerUp`, since that would also block a Staff
// member's legitimate self-view.
async function assertCanViewUser(requester: Request["user"], userId: string) {
  if (userId === requester!.id) return;
  const visibleIds = await getVisibleMemberIds(requester!);
  if (!visibleIds.includes(userId)) {
    throw new AppError(403, "Insufficient permissions to view this user's data");
  }
}

export async function staffPerformanceHandler(req: Request, res: Response) {
  const userId = (req.query.userId as string) ?? req.user!.id;
  await assertCanViewUser(req.user, userId);
  const months = req.query.months ? Number(req.query.months) : 6;
  res.json(await service.staffPerformanceReport(userId, months));
}

export async function staffTimesheetHandler(req: Request, res: Response) {
  const { from, to } = z.object({ from: z.string(), to: z.string() }).parse(req.query);
  const userId = (req.query.userId as string) ?? req.user!.id;
  await assertCanViewUser(req.user, userId);
  res.json(await service.staffTimesheetReport(userId, from, to));
}

export async function staffTaskActivityHandler(req: Request, res: Response) {
  const { from, to } = z.object({ from: z.string(), to: z.string() }).parse(req.query);
  const userId = (req.query.userId as string) ?? req.user!.id;
  await assertCanViewUser(req.user, userId);
  res.json(await service.staffTaskActivityReport(userId, new Date(from), new Date(to)));
}

export async function overdueHandler(req: Request, res: Response) {
  res.json(await service.overdueReport(req.user!));
}

export async function departmentRollupHandler(_req: Request, res: Response) {
  res.json(await service.departmentRollup());
}

export async function leaderboardExportHandler(req: Request, res: Response) {
  const period = (req.query.period as "WEEKLY" | "MONTHLY" | "QUARTERLY") ?? "MONTHLY";
  const format = (req.query.format as "json" | "csv") ?? "json";
  const rows = await service.leaderboardExport(period);
  respond(res, rows, format, "leaderboard-export");
}

export async function kpiReportHandler(req: Request, res: Response) {
  const filters = kpiReportFiltersSchema.parse(req.query);
  const rows = await kpiService.getKpiReport(req.user!, {
    ...filters,
    from: new Date(filters.from),
    to: new Date(filters.to),
  });
  respond(res, rows as unknown as Record<string, unknown>[], filters.format, "kpi-report");
}

export async function timesheetSummaryHandler(req: Request, res: Response) {
  const filters = timesheetSummaryFiltersSchema.parse(req.query);
  const rows = await service.timesheetSummaryReport(req.user!, filters);
  respond(res, rows as unknown as Record<string, unknown>[], filters.format, `timesheet-summary-by-${filters.groupBy}`);
}

export async function timesheetDetailHandler(req: Request, res: Response) {
  const filters = timesheetFiltersSchema.parse(req.query);
  const entries = await service.timesheetDetailReport(req.user!, filters);
  if (filters.format === "csv") {
    const rows = entries.map((e) => ({
      date: e.date.toISOString().slice(0, 10),
      employee: e.user.name,
      task: e.task ? `${e.task.taskNumber} — ${e.task.name}` : "",
      project: e.task?.project?.name ?? "",
      department: e.task?.department?.name ?? e.task?.project?.department?.name ?? "",
      entryType: e.entryType,
      hoursLogged: e.hoursLogged,
    }));
    return respond(res, rows, "csv", "timesheet-detail-report");
  }
  res.json(entries);
}
