import { prisma } from "../../config/prisma";
import { computeEfficiency } from "../kpi/kpi.service";
import { topLevelTaskFilter } from "../tasks/tasks.service";
import { getLeaderboard, LeaderboardPeriod } from "../leaderboard/leaderboard.service";

// Central Leadership Dashboard: cross-company, org-wide view. Admin-only —
// this deliberately ignores per-user department/company scoping, unlike the
// regular Dashboard, since its whole point is seeing across all companies.

export async function getCompaniesOverview() {
  const companies = await prisma.company.findMany();
  // Anchored to the start of today, not the exact current moment — see the
  // matching comment in tasks.service.ts's buildTaskWhereClauses.
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const perCompany = await Promise.all(
    companies.map(async (c) => {
      const scopeWhere = { ...topLevelTaskFilter, OR: [{ companyId: c.id }, { project: { companyId: c.id } }] };
      const [totalTasks, completedTasks, overdueTasks, totalUsers, totalProjects] = await Promise.all([
        prisma.task.count({ where: scopeWhere }),
        prisma.task.count({ where: { ...scopeWhere, status: "COMPLETED" } }),
        prisma.task.count({ where: { ...scopeWhere, dueDate: { lt: startOfToday }, status: { notIn: ["COMPLETED", "CANCELLED"] } } }),
        prisma.user.count({ where: { companyId: c.id, status: "ACTIVE" } }),
        prisma.project.count({ where: { companyId: c.id } }),
      ]);
      return { companyId: c.id, name: c.name, totalTasks, completedTasks, overdueTasks, totalUsers, totalProjects };
    }),
  );

  const combined = perCompany.reduce(
    (acc, c) => ({
      totalTasks: acc.totalTasks + c.totalTasks,
      completedTasks: acc.completedTasks + c.completedTasks,
      overdueTasks: acc.overdueTasks + c.overdueTasks,
      totalUsers: acc.totalUsers + c.totalUsers,
      totalProjects: acc.totalProjects + c.totalProjects,
    }),
    { totalTasks: 0, completedTasks: 0, overdueTasks: 0, totalUsers: 0, totalProjects: 0 },
  );

  return { perCompany, combined };
}

export async function getTopPerformers(period: LeaderboardPeriod, limit = 5) {
  const leaderboard = await getLeaderboard({ period });
  return leaderboard.slice(0, limit);
}

// Bottlenecks: departments with the highest overdue rate org-wide.
export async function getBottlenecks(limit = 10) {
  const departments = await prisma.department.findMany({ include: { company: true } });
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const rows = await Promise.all(
    departments.map(async (d) => {
      const scopeWhere = { ...topLevelTaskFilter, OR: [{ departmentId: d.id }, { project: { departmentId: d.id } }] };
      const [total, overdue] = await Promise.all([
        prisma.task.count({ where: scopeWhere }),
        prisma.task.count({ where: { ...scopeWhere, dueDate: { lt: startOfToday }, status: { notIn: ["COMPLETED", "CANCELLED"] } } }),
      ]);
      return {
        departmentId: d.id,
        department: d.name,
        company: d.company.name,
        total,
        overdue,
        overdueRate: total === 0 ? 0 : Math.round((overdue / total) * 1000) / 10,
      };
    }),
  );

  return rows
    .filter((r) => r.total > 0)
    .sort((a, b) => b.overdueRate - a.overdueRate)
    .slice(0, limit);
}

export async function getMilestoneDelays() {
  const now = Date.now();
  const milestones = await prisma.milestone.findMany({
    where: { status: { not: "COMPLETED" } },
    include: {
      project: { select: { name: true, startDate: true } },
      tasks: { where: topLevelTaskFilter, select: { percentComplete: true } },
    },
  });

  return milestones
    .map((m) => {
      const progress = m.tasks.length === 0 ? 0 : Math.round(m.tasks.reduce((s, t) => s + t.percentComplete, 0) / m.tasks.length);
      let atRisk = false;
      if (m.targetDate) {
        const start = m.project.startDate?.getTime() ?? m.createdAt.getTime();
        const target = m.targetDate.getTime();
        if (target > start) atRisk = (now - start) / (target - start) > 0.5 && progress < 50;
      }
      const isOverdue = Boolean(m.targetDate && m.targetDate.getTime() < now);
      return { id: m.id, name: m.name, project: m.project.name, targetDate: m.targetDate, progress, atRisk, isOverdue };
    })
    .filter((m) => m.atRisk || m.isOverdue);
}

export async function getProjectDelays() {
  const now = new Date();
  const projects = await prisma.project.findMany({
    where: { endDate: { lt: now }, status: { not: "COMPLETED" } },
    include: { company: { select: { name: true } }, department: { select: { name: true } } },
  });

  return Promise.all(
    projects.map(async (p) => {
      const tasks = await prisma.task.findMany({ where: { ...topLevelTaskFilter, projectId: p.id }, select: { percentComplete: true } });
      const progress = tasks.length === 0 ? 0 : Math.round(tasks.reduce((s, t) => s + t.percentComplete, 0) / tasks.length);
      return { id: p.id, name: p.name, company: p.company.name, department: p.department.name, endDate: p.endDate, progress };
    }),
  );
}

// Org-wide average time-efficiency per month, last N months.
export async function getEfficiencyTrend(months = 6) {
  const users = await prisma.user.findMany({ where: { status: "ACTIVE" }, select: { id: true } });
  const now = new Date();
  const trend = [];

  for (let i = months - 1; i >= 0; i--) {
    const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59, 999);
    const scores = await Promise.all(users.map((u) => computeEfficiency(u.id, monthStart, monthEnd)));
    const avg = scores.length === 0 ? 100 : scores.reduce((a, b) => a + b, 0) / scores.length;
    trend.push({ month: monthStart.toISOString().slice(0, 7), efficiency: Math.round(avg * 10) / 10 });
  }

  return trend;
}

export async function getLeadershipDashboard(period: LeaderboardPeriod = "MONTHLY") {
  const [companies, topPerformers, bottlenecks, milestoneDelays, projectDelays, efficiencyTrend] = await Promise.all([
    getCompaniesOverview(),
    getTopPerformers(period),
    getBottlenecks(),
    getMilestoneDelays(),
    getProjectDelays(),
    getEfficiencyTrend(),
  ]);

  return { period, companies, topPerformers, bottlenecks, milestoneDelays, projectDelays, efficiencyTrend };
}
