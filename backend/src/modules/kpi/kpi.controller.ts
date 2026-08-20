import { Request, Response } from "express";
import { z } from "zod";
import * as service from "./kpi.service";

export async function getConfigHandler(req: Request, res: Response) {
  const companyId = (req.query.companyId as string | undefined) ?? null;
  const config = await service.getWeightConfig(companyId);
  res.json(config ?? { onTimeWeight: 45, volumeWeight: 30, qualityWeight: 25, companyId });
}

const updateSchema = z.object({
  companyId: z.string().nullable().optional(),
  onTime: z.number().min(0).max(100).optional(),
  volume: z.number().min(0).max(100).optional(),
  quality: z.number().min(0).max(100).optional(),
});

export async function updateConfigHandler(req: Request, res: Response) {
  const body = updateSchema.parse(req.body);
  res.json(await service.upsertWeightConfig(body.companyId ?? null, body));
}
