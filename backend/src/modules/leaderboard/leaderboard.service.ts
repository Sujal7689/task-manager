import { prisma } from "../../config/prisma";
import { computeKpiForUser, computeTeamAverageVolume, getEffectiveWeights } from "../kpi/kpi.service";

export type LeaderboardPeriod = "WEEKLY" | "MONTHLY" | "QUARTERLY";

export function getPeriodRange(period: LeaderboardPeriod, reference = new Date()) {
  const to = new Date(reference);
  const from = new Date(reference);

  if (period === "WEEKLY") {
    const day = from.getDay();
    const diff = from.getDate() - day + (day === 0 ? -6 : 1);
    from.setDate(diff);
  } else if (period === "MONTHLY") {
    from.setDate(1);
  } else {
    const quarterStartMonth = Math.floor(from.getMonth() / 3) * 3;
    from.setMonth(quarterStartMonth, 1);
  }
  from.setHours(0, 0, 0, 0);
  to.setHours(23, 59, 59, 999);
  return { from, to };
}

export interface LeaderboardFilters {
  period: LeaderboardPeriod;
  companyId?: string;
  departmentId?: string;
}

// Section 6.6 + Section 12 decision #3: full peer scores visible to all staff, no ranking is hidden.
export async function getLeaderboard(filters: LeaderboardFilters) {
  const { from, to } = getPeriodRange(filters.period);

  const users = await prisma.user.findMany({
    where: {
      status: "ACTIVE",
      companyId: filters.companyId,
      departmentId: filters.departmentId,
    },
    select: { id: true, name: true, role: true, departmentId: true, department: { select: { name: true } } },
  });

  const userIds = users.map((u) => u.id);
  const teamAvgVolume = await computeTeamAverageVolume(userIds, from, to);
  const weights = await getEffectiveWeights(filters.companyId ?? null);

  const results = await Promise.all(
    users.map(async (u) => ({
      userId: u.id,
      name: u.name,
      department: u.department?.name ?? null,
      ...(await computeKpiForUser(u.id, from, to, teamAvgVolume, weights)),
    })),
  );

  // Someone with zero completed tasks this period has nothing to measure —
  // every sub-metric defaults to a "perfect" 100 in that case (see
  // computeUserKpiBase), which would otherwise rank them above people who
  // actually worked and got dinged for real imperfections. Leave them off
  // the ranking entirely rather than crediting them with a score.
  const ranked = results.filter((r) => r.totalClosed > 0);
  ranked.sort((a, b) => b.kpiScore - a.kpiScore);
  return ranked.map((r, index) => ({ rank: index + 1, ...r }));
}
