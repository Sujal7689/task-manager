import { Request, Response } from "express";
import * as service from "./leadership.service";
import { LeaderboardPeriod } from "../leaderboard/leaderboard.service";

export async function getHandler(req: Request, res: Response) {
  const period = (req.query.period as LeaderboardPeriod) ?? "MONTHLY";
  res.json(await service.getLeadershipDashboard(period));
}
