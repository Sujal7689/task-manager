import { Request, Response } from "express";
import { z } from "zod";
import * as service from "./leaderboard.service";

const querySchema = z.object({
  period: z.enum(["WEEKLY", "MONTHLY", "QUARTERLY"]).default("MONTHLY"),
  companyId: z.string().optional(),
  departmentId: z.string().optional(),
});

export async function getHandler(req: Request, res: Response) {
  const query = querySchema.parse(req.query);
  res.json(await service.getLeaderboard(query));
}
