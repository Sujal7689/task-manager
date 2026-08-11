import { Prisma, Priority, Role, TaskStatus, TimesheetEntryType } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { buildTaskFilterWhere, getTaskScopeWhere, TaskFilterInput, topLevelTaskFilter } from "../tasks/tasks.service";
import { computeKpiForUser, computeTeamAverageVolume, getEffectiveWeights } from "../kpi/kpi.service";
import { getLeaderboard } from "../leaderboard/leaderboard.service";
import { getVisibleTimesheetUserIds, toDate } from "../timesheets/timesheets.service";
import { sendEmail } from "../../utils/mailer";

interface AuthUser {
  id: string;
  role: Role;
  departmentId: string | null;
  companyId: string | null;
}

export interface ReportFilters {
  from?: string;
  to?: string;
  departmentId?: string;
  categoryId?: string;
  status?: TaskStatus;
}

export interface TaskDetailFilters extends TaskFilterInput {
  from?: string;
  to?: string;
}

export type GroupByDimension = "employee" | "team" | "project" | "company" | "department";

export interface GroupedReportFilters extends ReportFilters {
  groupBy: GroupByDimension;
  companyId?: string;
  projectId?: string;
  employeeId?: string;
}

export interface GroupedReportRow {
  groupKey: string;
  groupLabel: string;
  totalTasks: number;
  completed: number;
  onTimePct: number;
  overdue: number;
  avgPercentComplete: number;
  spentHours: number;
}

function dateRangeFilter(from?: string, to?: string) {
  if (!from && !to) return undefined;
  return { gte: from ? new Date(from) : undefined, lte: to ? new Date(to) : undefined };
}

// Sum of TASK_WORK hours logged against each of the given task IDs — "how
// much time is spent on this task", regardless of who logged it.
async function getSpentHoursByTask(taskIds: string[]): Promise<Map<string, number>> {
  if (taskIds.length === 0) return new Map();
  const rows = await prisma.timesheetEntry.groupBy({
    by: ["taskId"],
    where: { taskId: { in: taskIds }, entryType: "TASK_WORK" },
    _sum: { hoursLogged: true },
  });
  const map = new Map<string, number>();
  for (const r of rows) {
    if (r.taskId) map.set(r.taskId, Number(r._sum.hoursLogged ?? 0));
  }
  return map;
}

// 1. Task Detail Report — full field-level export, filterable, RBAC-scoped.
// Shares the same filter engine as the Task List (Assigned To/From, project,
// department, company, category, priority, overdue/overdue-days, team) so a
// dashboard/report number can drill down into exactly this list. Includes
// `spentHours` (actual hours logged) alongside `estimatedHours` on each task.
async function taskDetailWhere(user: AuthUser, filters: TaskDetailFilters) {
  const scope = await getTaskScopeWhere(user);
  const filterClauses = await buildTaskFilterWhere(filters);
  return {
    AND: [scope, ...filterClauses, filters.from || filters.to ? { createdAt: dateRangeFilter(filters.from, filters.to) } : {}],
  };
}

const taskDetailInclude = {
  project: { select: { name: true } },
  milestone: { select: { name: true } },
  category: { select: { name: true } },
  department: { select: { name: true } },
  assignedBy: { select: { name: true } },
  assignees: { include: { user: { select: { name: true } } } },
} satisfies Prisma.TaskInclude;

async function withSpentHours<T extends { id: string }>(tasks: T[]) {
  const spentByTask = await getSpentHoursByTask(tasks.map((t) => t.id));
  return tasks.map((t) => ({ ...t, spentHours: spentByTask.get(t.id) ?? 0 }));
}

// Full, unpaginated result — used for CSV export, which must never be
// silently truncated to one page.
export async function taskDetailReportAll(user: AuthUser, filters: TaskDetailFilters) {
  const where = await taskDetailWhere(user, filters);
  const tasks = await prisma.task.findMany({ where, include: taskDetailInclude, orderBy: { createdAt: "desc" } });
  return withSpentHours(tasks);
}

// Paginated result — used for the on-screen report table.
export async function taskDetailReportPage(user: AuthUser, filters: TaskDetailFilters, page: { skip: number; take: number }) {
  const where = await taskDetailWhere(user, filters);
  const [tasks, total] = await Promise.all([
    prisma.task.findMany({ where, include: taskDetailInclude, orderBy: { createdAt: "desc" }, skip: page.skip, take: page.take }),
    prisma.task.count({ where }),
  ]);
  return { items: await withSpentHours(tasks), total };
}

// Grouped task report — employee/team/project/company/department, filterable.
// Powers the Reports grid and can be reused for any "X-wise" breakdown.
export async function groupedTaskReport(user: AuthUser, filters: GroupedReportFilters): Promise<GroupedReportRow[]> {
  const scope = await getTaskScopeWhere(user);

  const tasks = await prisma.task.findMany({
    where: {
      AND: [
        scope,
        topLevelTaskFilter,
        filters.departmentId ? { departmentId: filters.departmentId } : {},
        filters.categoryId ? { categoryId: filters.categoryId } : {},
        filters.status ? { status: filters.status } : {},
        filters.projectId ? { projectId: filters.projectId } : {},
        filters.employeeId ? { assignees: { some: { userId: filters.employeeId } } } : {},
        filters.companyId ? { OR: [{ companyId: filters.companyId }, { project: { companyId: filters.companyId } }] } : {},
        filters.from || filters.to ? { createdAt: dateRangeFilter(filters.from, filters.to) } : {},
      ],
    },
    select: {
      id: true,
      status: true,
      percentComplete: true,
      dueDate: true,
      closedAt: true,
      projectId: true,
      companyId: true,
      departmentId: true,
      project: {
        select: {
          name: true,
          companyId: true,
          departmentId: true,
          company: { select: { name: true } },
          department: { select: { name: true } },
        },
      },
      company: { select: { name: true } },
      department: { select: { name: true } },
      assignees: {
        select: {
          user: {
            select: { id: true, name: true, reportingManagerId: true, reportingManager: { select: { name: true } } },
          },
        },
      },
    },
  });

  const spentByTask = await getSpentHoursByTask(tasks.map((t) => t.id));

  const now = new Date();
  interface Accumulator {
    key: string;
    label: string;
    total: number;
    completed: number;
    onTime: number;
    overdue: number;
    percentSum: number;
    spentHours: number;
  }
  const groups = new Map<string, Accumulator>();

  function bump(key: string, label: string, task: (typeof tasks)[number]) {
    let g = groups.get(key);
    if (!g) {
      g = { key, label, total: 0, completed: 0, onTime: 0, overdue: 0, percentSum: 0, spentHours: 0 };
      groups.set(key, g);
    }
    g.total++;
    g.percentSum += task.percentComplete;
    g.spentHours += spentByTask.get(task.id) ?? 0;
    if (task.status === "COMPLETED") {
      g.completed++;
      if (!task.dueDate || (task.closedAt && task.closedAt <= task.dueDate)) g.onTime++;
    } else if (task.dueDate && task.dueDate < now && task.status !== "CANCELLED") {
      g.overdue++;
    }
  }

  for (const task of tasks) {
    switch (filters.groupBy) {
      case "employee":
        if (task.assignees.length === 0) bump("unassigned", "Unassigned", task);
        else for (const a of task.assignees) bump(a.user.id, a.user.name, task);
        break;
      case "team":
        if (task.assignees.length === 0) bump("unassigned", "Unassigned", task);
        else
          for (const a of task.assignees) {
            if (!a.user.reportingManagerId) bump("no-team", "No Team Lead", task);
            else bump(a.user.reportingManagerId, `${a.user.reportingManager?.name}'s Team`, task);
          }
        break;
      case "project":
        bump(task.projectId ?? "no-project", task.project?.name ?? "No Project", task);
        break;
      case "company": {
        const companyId = task.companyId ?? task.project?.companyId ?? null;
        const companyName = task.company?.name ?? task.project?.company?.name ?? "Unclassified";
        bump(companyId ?? "unclassified", companyName, task);
        break;
      }
      case "department": {
        const deptId = task.departmentId ?? task.project?.departmentId ?? null;
        const deptName = task.department?.name ?? task.project?.department?.name ?? "Unclassified";
        bump(deptId ?? "unclassified", deptName, task);
        break;
      }
    }
  }

  return Array.from(groups.values())
    .map((g) => ({
      groupKey: g.key,
      groupLabel: g.label,
      totalTasks: g.total,
      completed: g.completed,
      onTimePct: g.completed === 0 ? 100 : Math.round((g.onTime / g.completed) * 1000) / 10,
      overdue: g.overdue,
      avgPercentComplete: g.total === 0 ? 0 : Math.round(g.percentSum / g.total),
      spentHours: Math.round(g.spentHours * 10) / 10,
    }))
    .sort((a, b) => b.totalTasks - a.totalTasks);
}

// 2. Task Summary Report — counts by status/category/department/date range.
export async function taskSummaryReport(user: AuthUser, filters: ReportFilters) {
  const scope = await getTaskScopeWhere(user);
  const where = {
    AND: [
      scope,
      topLevelTaskFilter,
      filters.departmentId ? { departmentId: filters.departmentId } : {},
      filters.from || filters.to ? { createdAt: dateRangeFilter(filters.from, filters.to) } : {},
    ],
  };

  const [byStatus, byCategory, byDepartment] = await Promise.all([
    prisma.task.groupBy({ by: ["status"], where, _count: true }),
    prisma.task.groupBy({ by: ["categoryId"], where, _count: true }),
    prisma.task.groupBy({ by: ["departmentId"], where, _count: true }),
  ]);

  return { byStatus, byCategory, byDepartment };
}

// 3. Staff Performance Report — KPI trend over the last N months for one user.
export async function staffPerformanceReport(userId: string, months = 6) {
  const weights = await getEffectiveWeights(null);
  const trend = [];
  const now = new Date();
  for (let i = months - 1; i >= 0; i--) {
    const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59, 999);
    const teamAvg = await computeTeamAverageVolume([userId], monthStart, monthEnd);
    const kpi = await computeKpiForUser(userId, monthStart, monthEnd, teamAvg, weights);
    trend.push({ month: monthStart.toISOString().slice(0, 7), ...kpi });
  }
  return trend;
}

// 4. Staff Timesheet Report — daily entries with task vs non-task split.
export async function staffTimesheetReport(userId: string, from: string, to: string) {
  const entries = await prisma.timesheetEntry.findMany({
    where: { userId, date: { gte: new Date(from), lte: new Date(to) } },
    include: { task: { select: { taskNumber: true, name: true } } },
    orderBy: { date: "asc" },
  });
  const taskHours = entries.filter((e) => e.entryType === "TASK_WORK").reduce((s, e) => s + Number(e.hoursLogged), 0);
  const nonTaskHours = entries.reduce((s, e) => s + Number(e.hoursLogged), 0) - taskHours;
  return { entries, taskHours, nonTaskHours };
}

// 5. Overdue Report — aging buckets 1-3 / 4-7 / 7+ days.
export async function overdueReport(user: AuthUser) {
  const scope = await getTaskScopeWhere(user);
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const tasks = await prisma.task.findMany({
    where: { AND: [scope, topLevelTaskFilter, { dueDate: { lt: startOfToday }, status: { notIn: ["COMPLETED", "CANCELLED"] } }] },
    select: { id: true, taskNumber: true, name: true, dueDate: true, departmentId: true },
  });

  const buckets = { "1-3": [] as typeof tasks, "4-7": [] as typeof tasks, "7+": [] as typeof tasks };
  for (const t of tasks) {
    const days = Math.floor((startOfToday.getTime() - t.dueDate!.getTime()) / (24 * 60 * 60 * 1000));
    if (days <= 3) buckets["1-3"].push(t);
    else if (days <= 7) buckets["4-7"].push(t);
    else buckets["7+"].push(t);
  }
  return buckets;
}

// 6. Department/Company Rollup — cross-entity comparison.
export async function departmentRollup() {
  const departments = await prisma.department.findMany({ include: { company: true } });
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  return Promise.all(
    departments.map(async (d) => {
      // A task's department is often only set via its Project (Task.departmentId is optional
      // and rarely filled in directly by the Task form), so match on either.
      const scopeWhere = { ...topLevelTaskFilter, OR: [{ departmentId: d.id }, { project: { departmentId: d.id } }] };
      const [total, completed, overdue] = await Promise.all([
        prisma.task.count({ where: scopeWhere }),
        prisma.task.count({ where: { ...scopeWhere, status: "COMPLETED" } }),
        prisma.task.count({ where: { ...scopeWhere, dueDate: { lt: startOfToday }, status: { notIn: ["COMPLETED", "CANCELLED"] } } }),
      ]);
      return { departmentId: d.id, department: d.name, company: d.company.name, total, completed, overdue };
    }),
  );
}

// 7. Leaderboard Export — point-in-time snapshot (reuses the leaderboard computation).
export async function leaderboardExport(period: "WEEKLY" | "MONTHLY" | "QUARTERLY") {
  return getLeaderboard({ period });
}

// ==================== Timesheet Report (detailed + summary) ====================
// "How much time was spent on any task/project, and by whom" — grouped and
// filtered by employee/task/project/department/date, per your request.

export type TimesheetGroupBy = "employee" | "task" | "project" | "department";

export interface TimesheetReportFilters {
  employeeId?: string;
  taskId?: string;
  projectId?: string;
  milestoneId?: string;
  departmentId?: string;
  companyId?: string;
  from?: string;
  to?: string;
  entryType?: TimesheetEntryType;
}

const timesheetEntryInclude = {
  user: { select: { id: true, name: true } },
  task: {
    select: {
      id: true,
      taskNumber: true,
      name: true,
      projectId: true,
      departmentId: true,
      project: { select: { id: true, name: true, departmentId: true, department: { select: { name: true } } } },
      department: { select: { name: true } },
    },
  },
} satisfies Prisma.TimesheetEntryInclude;

async function fetchScopedTimesheetEntries(user: AuthUser, filters: TimesheetReportFilters) {
  const userIds = await getVisibleTimesheetUserIds(user);

  const where: Prisma.TimesheetEntryWhereInput = {
    AND: [
      userIds ? { userId: { in: userIds } } : {},
      filters.employeeId ? { userId: filters.employeeId } : {},
      filters.taskId ? { taskId: filters.taskId } : {},
      filters.entryType ? { entryType: filters.entryType } : {},
      filters.from ? { date: { gte: toDate(filters.from) } } : {},
      filters.to ? { date: { lte: toDate(filters.to) } } : {},
      filters.projectId ? { task: { projectId: filters.projectId } } : {},
      filters.milestoneId ? { task: { milestoneId: filters.milestoneId } } : {},
      filters.departmentId
        ? { task: { OR: [{ departmentId: filters.departmentId }, { project: { departmentId: filters.departmentId } }] } }
        : {},
      filters.companyId
        ? { task: { OR: [{ companyId: filters.companyId }, { project: { companyId: filters.companyId } }] } }
        : {},
    ],
  };

  return prisma.timesheetEntry.findMany({ where, include: timesheetEntryInclude, orderBy: { date: "desc" } });
}

// Timesheet Detail Report — every entry, individually, with full context.
export async function timesheetDetailReport(user: AuthUser, filters: TimesheetReportFilters) {
  return fetchScopedTimesheetEntries(user, filters);
}

export interface TimesheetSummaryRow {
  groupKey: string;
  groupLabel: string;
  totalHours: number;
  taskHours: number;
  nonTaskHours: number;
  entryCount: number;
}

// Timesheet Summary Report — rolled up by employee/task/project/department.
export async function timesheetSummaryReport(
  user: AuthUser,
  filters: TimesheetReportFilters & { groupBy: TimesheetGroupBy },
): Promise<TimesheetSummaryRow[]> {
  const entries = await fetchScopedTimesheetEntries(user, filters);

  interface Accumulator {
    key: string;
    label: string;
    totalHours: number;
    taskHours: number;
    nonTaskHours: number;
    entryCount: number;
  }
  const groups = new Map<string, Accumulator>();

  function bump(key: string, label: string, entry: (typeof entries)[number]) {
    let g = groups.get(key);
    if (!g) {
      g = { key, label, totalHours: 0, taskHours: 0, nonTaskHours: 0, entryCount: 0 };
      groups.set(key, g);
    }
    const hours = Number(entry.hoursLogged);
    g.totalHours += hours;
    g.entryCount++;
    if (entry.entryType === "TASK_WORK") g.taskHours += hours;
    else g.nonTaskHours += hours;
  }

  for (const entry of entries) {
    switch (filters.groupBy) {
      case "employee":
        bump(entry.user.id, entry.user.name, entry);
        break;
      case "task":
        if (!entry.task) bump("non-task", "Non-task time", entry);
        else bump(entry.task.id, `${entry.task.taskNumber} — ${entry.task.name}`, entry);
        break;
      case "project": {
        if (!entry.task) bump("non-task", "Non-task time", entry);
        else bump(entry.task.projectId ?? "no-project", entry.task.project?.name ?? "No Project", entry);
        break;
      }
      case "department": {
        if (!entry.task) {
          bump("non-task", "Non-task time", entry);
        } else {
          const deptId = entry.task.departmentId ?? entry.task.project?.departmentId ?? null;
          const deptName = entry.task.department?.name ?? entry.task.project?.department?.name ?? "Unclassified";
          bump(deptId ?? "unclassified", deptName, entry);
        }
        break;
      }
    }
  }

  return Array.from(groups.values())
    .map((g) => ({
      groupKey: g.key,
      groupLabel: g.label,
      totalHours: Math.round(g.totalHours * 100) / 100,
      taskHours: Math.round(g.taskHours * 100) / 100,
      nonTaskHours: Math.round(g.nonTaskHours * 100) / 100,
      entryCount: g.entryCount,
    }))
    .sort((a, b) => b.totalHours - a.totalHours);
}

// Scheduled weekly summary email (Section 6.8: "schedulable, auto-email weekly summary").
export async function sendWeeklySummaryEmails() {
  const managers = await prisma.user.findMany({ where: { role: { in: ["ADMIN", "MANAGER"] }, status: "ACTIVE" } });
  const from = new Date();
  from.setDate(from.getDate() - 7);

  for (const manager of managers) {
    const summary = await taskSummaryReport(manager, { from: from.toISOString() });
    const lines = [
      `Weekly task summary for the past 7 days:`,
      ...summary.byStatus.map((s) => `${s.status}: ${s._count}`),
    ];
    await sendEmail(manager.email, "Weekly Task Summary", lines.join("\n"));
  }
}
