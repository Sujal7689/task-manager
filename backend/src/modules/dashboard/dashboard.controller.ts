import { Request, Response } from "express";
import * as service from "./dashboard.service";
import { LeaderboardPeriod } from "../leaderboard/leaderboard.service";

export async function summaryHandler(req: Request, res: Response) {
  const user = req.user!;
  const staff = await service.getStaffSummary(user);

  if (user.role === "ADMIN") {
    return res.json({ role: "ADMIN", staff, admin: await service.getAdminSummary() });
  }
  if (user.role === "MANAGER") {
    return res.json({ role: "MANAGER", staff, manager: await service.getManagerSummary(user) });
  }
  res.json({ role: user.role, staff });
}

export async function memberKpiHandler(req: Request, res: Response) {
  const period = (req.query.period as LeaderboardPeriod) ?? "MONTHLY";
  res.json(await service.getMemberKpi(req.user!, period));
}

export async function projectProgressHandler(req: Request, res: Response) {
  res.json(await service.getProjectProgress(req.user!));
}

export async function milestoneTrackingHandler(req: Request, res: Response) {
  res.json(await service.getMilestoneTracking(req.user!));
}

export async function delayAnalysisHandler(req: Request, res: Response) {
  res.json(await service.getDelayAnalysis(req.user!));
}

export async function statusDistributionHandler(req: Request, res: Response) {
  res.json(await service.getStatusDistribution(req.user!));
}

export async function taskTrendHandler(req: Request, res: Response) {
  const weeks = req.query.weeks ? Number(req.query.weeks) : 8;
  res.json(await service.getTaskTrend(req.user!, weeks));
}
