import { Role } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { getTaskScopeWhere, topLevelTaskFilter } from "../tasks/tasks.service";
import { getDirectReportIds } from "../users/users.service";
import { computeMemberSummary, computeTeamAverageVolume, getEffectiveWeights, MemberSummary } from "../kpi/kpi.service";
import { getPeriodRange, LeaderboardPeriod } from "../leaderboard/leaderboard.service";

interface AuthUser {
  id: string;
  role: Role;
  departmentId: string | null;
  companyId: string | null;
}

export async function getStaffSummary(user: AuthUser) {
  const scope = await getTaskScopeWhere(user);
  const now = new Date();
  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 999);
  const endOfWeek = new Date(now);
  endOfWeek.setDate(endOfWeek.getDate() + 7);

  const [totalTasks, dueToday, dueThisWeek, overdue, criticalCount, recent] = await Promise.all([
    prisma.task.count({ where: { AND: [scope, topLevelTaskFilter] } }),
    prisma.task.count({ where: { AND: [scope, topLevelTaskFilter, { dueDate: { lte: endOfToday, gte: now } }] } }),
    prisma.task.count({ where: { AND: [scope, topLevelTaskFilter, { dueDate: { lte: endOfWeek, gte: now } }] } }),
    prisma.task.count({
      where: { AND: [scope, topLevelTaskFilter, { dueDate: { lt: now }, status: { notIn: ["COMPLETED", "CANCELLED"] } }] },
    }),
    prisma.task.count({
      where: { AND: [scope, topLevelTaskFilter, { priority: "CRITICAL" }, { status: { notIn: ["COMPLETED", "CANCELLED"] } }] },
    }),
    prisma.task.findMany({
      where: { AND: [scope, topLevelTaskFilter] },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { id: true, taskNumber: true, name: true, status: true, dueDate: true },
    }),
  ]);

  return { totalTasks, dueToday, dueThisWeek, overdue, criticalCount, recent };
}

export async function getManagerSummary(user: AuthUser) {
  if (!user.departmentId) return { heatmap: [], overdueCount: 0 };

  const tasks = await prisma.task.findMany({
    where: { AND: [topLevelTaskFilter, { OR: [{ departmentId: user.departmentId }, { project: { departmentId: user.departmentId } }] }] },
    select: { status: true, dueDate: true },
  });

  const statuses = ["NOT_STARTED", "IN_PROGRESS", "ON_HOLD", "UNDER_REVIEW", "COMPLETED", "CANCELLED"] as const;
  const heatmap = statuses.map((status) => ({ status, count: tasks.filter((t) => t.status === status).length }));
  const now = new Date();
  const overdueCount = tasks.filter((t) => t.dueDate && t.dueDate < now && t.status !== "COMPLETED" && t.status !== "CANCELLED").length;

  return { heatmap, overdueCount };
}

export async function getAdminSummary() {
  const [departments, totalUsers, totalProjects, totalTasks] = await Promise.all([
    prisma.department.findMany(),
    prisma.user.count({ where: { status: "ACTIVE" } }),
    prisma.project.count(),
    prisma.task.count({ where: topLevelTaskFilter }),
  ]);

  // Not a Prisma relation _count: that only follows Task.departmentId directly,
  // undercounting tasks that only carry a department via their Project.
  const taskVolumeByDepartment = await Promise.all(
    departments.map(async (d) => ({
      departmentId: d.id,
      department: d.name,
      count: await prisma.task.count({
        where: { AND: [topLevelTaskFilter, { OR: [{ departmentId: d.id }, { project: { departmentId: d.id } }] }] },
      }),
    })),
  );

  return { taskVolumeByDepartment, totalUsers, totalProjects, totalTasks };
}

// Scopes which employees' KPI a viewer can see on their Dashboard: Admin = everyone,
// Manager = their department, Team Lead = direct reports + self, Staff = self only.
// (The full-org Leaderboard is the dedicated place for peer-visible rankings —
// Section 12 decision #3 — this widget is a narrower "your team" view.)
async function getVisibleMemberIds(user: AuthUser): Promise<string[]> {
  if (user.role === "ADMIN") {
    return (await prisma.user.findMany({ where: { status: "ACTIVE" }, select: { id: true } })).map((u) => u.id);
  }
  if (user.role === "MANAGER") {
    if (!user.departmentId) return [user.id];
    return (await prisma.user.findMany({ where: { departmentId: user.departmentId, status: "ACTIVE" }, select: { id: true } })).map(
      (u) => u.id,
    );
  }
  if (user.role === "TEAM_LEAD") {
    return [...(await getDirectReportIds(user.id)), user.id];
  }
  return [user.id];
}

export async function getMemberKpi(user: AuthUser, period: LeaderboardPeriod = "MONTHLY"): Promise<MemberSummary[]> {
  const { from, to } = getPeriodRange(period);
  const memberIds = await getVisibleMemberIds(user);
  const users = await prisma.user.findMany({
    where: { id: { in: memberIds } },
    select: { id: true, name: true, department: { select: { name: true } } },
  });

  const teamAvgVolume = await computeTeamAverageVolume(memberIds, from, to);
  const weights = await getEffectiveWeights(user.companyId);

  const summaries = await Promise.all(
    users.map((u) => computeMemberSummary(u.id, u.name, u.department?.name ?? null, from, to, teamAvgVolume, weights)),
  );
  return summaries.sort((a, b) => b.kpiScore - a.kpiScore);
}

async function getVisibleProjects(user: AuthUser) {
  if (user.role === "ADMIN") return prisma.project.findMany();
  if (user.role === "MANAGER" && user.departmentId) {
    return prisma.project.findMany({ where: { departmentId: user.departmentId } });
  }
  const scope = await getTaskScopeWhere(user);
  const projectIds = await prisma.task.findMany({ where: scope, select: { projectId: true }, distinct: ["projectId"] });
  const ids = projectIds.map((p) => p.projectId).filter((id): id is string => Boolean(id));
  return prisma.project.findMany({ where: { id: { in: ids } } });
}

// Project-wise progress: % complete derived from the average of each project's tasks.
export async function getProjectProgress(user: AuthUser) {
  const projects = await getVisibleProjects(user);
  return Promise.all(
    projects.map(async (p) => {
      const tasks = await prisma.task.findMany({
        where: { AND: [topLevelTaskFilter, { projectId: p.id }] },
        select: { percentComplete: true, status: true },
      });
      const avgProgress = tasks.length === 0 ? 0 : Math.round(tasks.reduce((s, t) => s + t.percentComplete, 0) / tasks.length);
      const completedCount = tasks.filter((t) => t.status === "COMPLETED").length;
      return {
        id: p.id,
        name: p.name,
        status: p.status,
        endDate: p.endDate,
        totalTasks: tasks.length,
        completedTasks: completedCount,
        progress: avgProgress,
        isDelayed: Boolean(p.endDate && p.endDate < new Date() && p.status !== "COMPLETED"),
      };
    }),
  );
}

// Milestone tracking: progress rollup + the same "at risk" rule used by the
// escalation cron (past 50% of the timeline with <50% task completion).
export async function getMilestoneTracking(user: AuthUser) {
  const projects = await getVisibleProjects(user);
  const projectIds = projects.map((p) => p.id);
  const milestones = await prisma.milestone.findMany({
    where: { projectId: { in: projectIds } },
    include: {
      project: { select: { name: true, startDate: true } },
      tasks: { where: topLevelTaskFilter, select: { percentComplete: true } },
    },
    orderBy: { targetDate: "asc" },
  });

  const now = Date.now();
  return milestones.map((m) => {
    const progress =
      m.tasks.length === 0 ? 0 : Math.round(m.tasks.reduce((s, t) => s + t.percentComplete, 0) / m.tasks.length);

    let atRisk = false;
    if (m.targetDate && m.status !== "COMPLETED") {
      const start = m.project.startDate?.getTime() ?? m.createdAt.getTime();
      const target = m.targetDate.getTime();
      if (target > start) {
        const elapsedRatio = (now - start) / (target - start);
        atRisk = elapsedRatio > 0.5 && progress < 50;
      }
    }

    return {
      id: m.id,
      name: m.name,
      project: m.project.name,
      status: m.status,
      targetDate: m.targetDate,
      progress,
      atRisk,
      isOverdue: Boolean(m.targetDate && m.targetDate.getTime() < now && m.status !== "COMPLETED"),
    };
  });
}

// Delay analysis: overdue tasks (aging buckets), delayed milestones, delayed projects — one call.
export async function getDelayAnalysis(user: AuthUser) {
  const scope = await getTaskScopeWhere(user);
  const now = new Date();

  const overdueTasks = await prisma.task.findMany({
    where: { AND: [scope, topLevelTaskFilter, { dueDate: { lt: now }, status: { notIn: ["COMPLETED", "CANCELLED"] } }] },
    select: { id: true, taskNumber: true, name: true, dueDate: true },
  });

  const buckets = { "1-3": 0, "4-7": 0, "7+": 0 };
  for (const t of overdueTasks) {
    const days = Math.floor((now.getTime() - t.dueDate!.getTime()) / (24 * 60 * 60 * 1000));
    if (days <= 3) buckets["1-3"]++;
    else if (days <= 7) buckets["4-7"]++;
    else buckets["7+"]++;
  }

  const [milestones, projects] = await Promise.all([getMilestoneTracking(user), getProjectProgress(user)]);

  return {
    overdueTaskBuckets: buckets,
    totalOverdueTasks: overdueTasks.length,
    delayedMilestones: milestones.filter((m) => m.isOverdue || m.atRisk),
    delayedProjects: projects.filter((p) => p.isDelayed),
  };
}

// Current status distribution (pie chart). A plain snapshot — no time dimension.
export async function getStatusDistribution(user: AuthUser) {
  const scope = await getTaskScopeWhere(user);
  const tasks = await prisma.task.findMany({ where: { AND: [scope, topLevelTaskFilter] }, select: { status: true } });
  const statuses = ["NOT_STARTED", "IN_PROGRESS", "ON_HOLD", "UNDER_REVIEW", "COMPLETED", "CANCELLED"] as const;
  return statuses.map((status) => ({ status, count: tasks.filter((t) => t.status === status).length }));
}

export interface TaskTrendWeek {
  weekStart: string;
  created: number;
  completed: number;
  due: number;
  inProgress: number;
}

// Task trend (line chart), last N weeks. There's no status-history table, so
// "In Progress" is defined as: of the tasks CREATED in that week, how many are
// in IN_PROGRESS status right now (a per-cohort snapshot) — not a true
// historical "how many were in progress on that date" series, which this data
// model can't reconstruct. Created/Completed/Due are plain per-week counts
// from timestamps we do have (createdAt/closedAt/dueDate).
export async function getTaskTrend(user: AuthUser, weeks = 8): Promise<TaskTrendWeek[]> {
  const scope = await getTaskScopeWhere(user);
  const now = new Date();
  const result: TaskTrendWeek[] = [];

  for (let i = weeks - 1; i >= 0; i--) {
    const weekEnd = new Date(now);
    weekEnd.setDate(weekEnd.getDate() - i * 7);
    weekEnd.setHours(23, 59, 59, 999);
    const weekStart = new Date(weekEnd);
    weekStart.setDate(weekStart.getDate() - 6);
    weekStart.setHours(0, 0, 0, 0);

    const [created, completed, due, createdThisWeekInProgress] = await Promise.all([
      prisma.task.count({ where: { AND: [scope, topLevelTaskFilter, { createdAt: { gte: weekStart, lte: weekEnd } }] } }),
      prisma.task.count({
        where: { AND: [scope, topLevelTaskFilter, { status: "COMPLETED", closedAt: { gte: weekStart, lte: weekEnd } }] },
      }),
      prisma.task.count({ where: { AND: [scope, topLevelTaskFilter, { dueDate: { gte: weekStart, lte: weekEnd } }] } }),
      prisma.task.count({
        where: { AND: [scope, topLevelTaskFilter, { createdAt: { gte: weekStart, lte: weekEnd }, status: "IN_PROGRESS" }] },
      }),
    ]);

    result.push({ weekStart: weekStart.toISOString().slice(0, 10), created, completed, due, inProgress: createdThisWeekInProgress });
  }

  return result;
}
