import { prisma } from "../../config/prisma";

export interface KpiWeights {
  onTime: number;
  estimateAccuracy: number;
  volume: number;
  quality: number;
}

const DEFAULT_WEIGHTS: KpiWeights = { onTime: 40, estimateAccuracy: 25, volume: 20, quality: 15 };

// Section 12 decision #2: 40/25/20/15 defaults, configurable per-company by Admin (Phase 6 UI).
export async function getEffectiveWeights(companyId?: string | null): Promise<KpiWeights> {
  const config = companyId
    ? await prisma.kpiWeightConfig.findUnique({ where: { companyId } })
    : await prisma.kpiWeightConfig.findFirst({ where: { companyId: null } });

  if (!config) return DEFAULT_WEIGHTS;
  return {
    onTime: Number(config.onTimeWeight),
    estimateAccuracy: Number(config.estimateAccuracyWeight),
    volume: Number(config.volumeWeight),
    quality: Number(config.qualityWeight),
  };
}

export async function getWeightConfig(companyId?: string | null) {
  return prisma.kpiWeightConfig.findFirst({ where: { companyId: companyId ?? null } });
}

export async function upsertWeightConfig(companyId: string | null, weights: Partial<KpiWeights>) {
  // Not a plain Prisma `upsert`: companyId is a nullable @unique column, and
  // Postgres treats multiple NULLs as distinct, so upserting on `{ companyId: null }`
  // would silently create a second global-default row on every save instead of
  // updating the first one. Look the row up explicitly instead.
  const existing = await prisma.kpiWeightConfig.findFirst({ where: { companyId } });

  if (existing) {
    return prisma.kpiWeightConfig.update({
      where: { id: existing.id },
      data: {
        onTimeWeight: weights.onTime,
        estimateAccuracyWeight: weights.estimateAccuracy,
        volumeWeight: weights.volume,
        qualityWeight: weights.quality,
      },
    });
  }

  return prisma.kpiWeightConfig.create({
    data: {
      companyId,
      onTimeWeight: weights.onTime ?? DEFAULT_WEIGHTS.onTime,
      estimateAccuracyWeight: weights.estimateAccuracy ?? DEFAULT_WEIGHTS.estimateAccuracy,
      volumeWeight: weights.volume ?? DEFAULT_WEIGHTS.volume,
      qualityWeight: weights.quality ?? DEFAULT_WEIGHTS.quality,
    },
  });
}

interface UserKpiBase {
  totalClosed: number;
  onTimePct: number;
  estimateAccuracy: number;
  qualityScore: number;
}

// Section 6.5 sub-metrics. `closedAt` (not `updatedAt`) anchors "on time" so later,
// unrelated edits to a closed task don't retroactively change its completion moment.
async function computeUserKpiBase(userId: string, from: Date, to: Date): Promise<UserKpiBase> {
  const completedTasks = await prisma.task.findMany({
    where: { assignees: { some: { userId } }, status: "COMPLETED", closedAt: { gte: from, lte: to } },
    select: { id: true, dueDate: true, closedAt: true, estimatedHours: true, closureRating: true },
  });

  const totalClosed = completedTasks.length;
  const onTimeCount = completedTasks.filter((t) => !t.dueDate || (t.closedAt && t.closedAt <= t.dueDate)).length;
  const onTimePct = totalClosed === 0 ? 100 : (onTimeCount / totalClosed) * 100;

  const withEstimate = completedTasks.filter((t) => t.estimatedHours != null && Number(t.estimatedHours) > 0);
  let estimateAccuracy = 100;
  if (withEstimate.length > 0) {
    const scores: number[] = [];
    for (const t of withEstimate) {
      const actual = await prisma.timesheetEntry.aggregate({
        where: { taskId: t.id, entryType: "TASK_WORK" },
        _sum: { hoursLogged: true },
      });
      const actualHours = Number(actual._sum.hoursLogged ?? 0);
      const est = Number(t.estimatedHours);
      const deviation = Math.abs(actualHours - est) / est;
      scores.push(Math.max(0, 100 - deviation * 100));
    }
    estimateAccuracy = scores.reduce((a, b) => a + b, 0) / scores.length;
  }

  const qualityRated = completedTasks.filter((t) => t.closureRating != null);
  const qualityScore =
    qualityRated.length === 0
      ? 100
      : (qualityRated.reduce((sum, t) => sum + (t.closureRating as number), 0) / qualityRated.length / 5) * 100;

  return { totalClosed, onTimePct, estimateAccuracy, qualityScore };
}

export async function computeTeamAverageVolume(userIds: string[], from: Date, to: Date): Promise<number> {
  if (userIds.length === 0) return 0;
  const counts = await Promise.all(
    userIds.map((uid) =>
      prisma.task.count({ where: { assignees: { some: { userId: uid } }, status: "COMPLETED", closedAt: { gte: from, lte: to } } }),
    ),
  );
  return counts.reduce((a, b) => a + b, 0) / counts.length;
}

export interface UserKpiResult extends UserKpiBase {
  volumeScore: number;
  kpiScore: number;
}

export async function computeKpiForUser(
  userId: string,
  from: Date,
  to: Date,
  teamAvgVolume: number,
  weights: KpiWeights,
): Promise<UserKpiResult> {
  const base = await computeUserKpiBase(userId, from, to);
  const volumeScore = teamAvgVolume > 0 ? Math.min(150, (base.totalClosed / teamAvgVolume) * 100) : base.totalClosed > 0 ? 100 : 0;
  const kpiScore =
    (base.onTimePct * weights.onTime +
      base.estimateAccuracy * weights.estimateAccuracy +
      volumeScore * weights.volume +
      base.qualityScore * weights.quality) /
    100;

  return { ...base, volumeScore, kpiScore: Math.round(kpiScore * 100) / 100 };
}

// Efficiency: time efficiency on completed, estimated tasks — rewards finishing
// at-or-under the estimate (ratio-based), unlike Estimate Accuracy above which
// penalizes both over- AND under-estimates symmetrically. Deliberately a
// different lens on the same underlying data (not defined precisely in the
// spec, so documented here as a flagged assumption — see README).
export async function computeEfficiency(userId: string, from: Date, to: Date): Promise<number> {
  const completedTasks = await prisma.task.findMany({
    where: { assignees: { some: { userId } }, status: "COMPLETED", closedAt: { gte: from, lte: to } },
    select: { id: true, estimatedHours: true },
  });
  const withEstimate = completedTasks.filter((t) => t.estimatedHours != null && Number(t.estimatedHours) > 0);
  if (withEstimate.length === 0) return 100;

  const scores: number[] = [];
  for (const t of withEstimate) {
    const actual = await prisma.timesheetEntry.aggregate({
      where: { taskId: t.id, entryType: "TASK_WORK" },
      _sum: { hoursLogged: true },
    });
    const actualHours = Number(actual._sum.hoursLogged ?? 0);
    const est = Number(t.estimatedHours);
    scores.push(actualHours <= 0 ? 100 : Math.min(100, (est / actualHours) * 100));
  }
  return scores.reduce((a, b) => a + b, 0) / scores.length;
}

export interface WorkloadWeek {
  weekStart: string;
  assigned: number;
  completed: number;
}

// Workload trend: tasks newly assigned vs. completed per week, most recent last.
export async function computeWorkloadTrend(userId: string, weeks = 8): Promise<WorkloadWeek[]> {
  const now = new Date();
  const results: WorkloadWeek[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const weekEnd = new Date(now);
    weekEnd.setDate(weekEnd.getDate() - i * 7);
    weekEnd.setHours(23, 59, 59, 999);
    const weekStart = new Date(weekEnd);
    weekStart.setDate(weekStart.getDate() - 6);
    weekStart.setHours(0, 0, 0, 0);

    const [assigned, completed] = await Promise.all([
      prisma.taskAssignee.count({ where: { userId, assignedAt: { gte: weekStart, lte: weekEnd } } }),
      prisma.task.count({ where: { assignees: { some: { userId } }, status: "COMPLETED", closedAt: { gte: weekStart, lte: weekEnd } } }),
    ]);
    results.push({ weekStart: weekStart.toISOString().slice(0, 10), assigned, completed });
  }
  return results;
}

// Estimated hours (from completed tasks) vs actual hours logged (Timesheet),
// for the "time taken vs estimated" performance chart.
export async function computeHoursComparison(userId: string, from: Date, to: Date): Promise<{ estimatedHours: number; actualHours: number }> {
  const [completedTasks, actualAgg] = await Promise.all([
    prisma.task.findMany({
      where: { assignees: { some: { userId } }, status: "COMPLETED", closedAt: { gte: from, lte: to } },
      select: { estimatedHours: true },
    }),
    prisma.timesheetEntry.aggregate({
      where: { userId, entryType: "TASK_WORK", date: { gte: from, lte: to } },
      _sum: { hoursLogged: true },
    }),
  ]);

  const estimatedHours = completedTasks.reduce((sum, t) => sum + Number(t.estimatedHours ?? 0), 0);
  const actualHours = Number(actualAgg._sum.hoursLogged ?? 0);
  return { estimatedHours: Math.round(estimatedHours * 10) / 10, actualHours: Math.round(actualHours * 10) / 10 };
}

export interface MemberSummary extends UserKpiResult {
  userId: string;
  name: string;
  department: string | null;
  totalTasks: number;
  completedOnTime: number;
  efficiency: number;
  feedbackQuality: number;
  workloadTrend: WorkloadWeek[];
  estimatedHours: number;
  actualHours: number;
}

// Powers both the Dashboard "Member-wise KPI" widget and the dedicated
// Team Member Dashboard — one employee-wise summary row per call.
export async function computeMemberSummary(
  userId: string,
  name: string,
  department: string | null,
  from: Date,
  to: Date,
  teamAvgVolume: number,
  weights: KpiWeights,
): Promise<MemberSummary> {
  const [kpi, efficiency, totalTasks, workloadTrend, hours] = await Promise.all([
    computeKpiForUser(userId, from, to, teamAvgVolume, weights),
    computeEfficiency(userId, from, to),
    prisma.taskAssignee.count({ where: { userId } }),
    computeWorkloadTrend(userId, 8),
    computeHoursComparison(userId, from, to),
  ]);

  const completedOnTime = Math.round((kpi.onTimePct / 100) * kpi.totalClosed);

  return {
    ...kpi,
    userId,
    name,
    estimatedHours: hours.estimatedHours,
    actualHours: hours.actualHours,
    department,
    totalTasks,
    completedOnTime,
    efficiency,
    feedbackQuality: kpi.qualityScore,
    workloadTrend,
  };
}
