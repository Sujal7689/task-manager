import { Request, Response } from "express";
import { z } from "zod";
import { MilestoneStatus } from "@prisma/client";
import * as service from "./milestones.service";

const createSchema = z.object({
  name: z.string().min(1),
  projectId: z.string().min(1),
  targetDate: z.string().optional(),
  ownerId: z.string().min(1),
  status: z.nativeEnum(MilestoneStatus).optional(),
});
const updateSchema = createSchema.partial();

export async function listHandler(req: Request, res: Response) {
  res.json(await service.listMilestones(req.query.projectId as string | undefined));
}
export async function getHandler(req: Request, res: Response) {
  const milestone = await service.getMilestone(req.params.id);
  const progress = await service.getMilestoneProgress(req.params.id);
  res.json({ ...milestone, computedProgress: progress });
}
export async function createHandler(req: Request, res: Response) {
  const body = createSchema.parse(req.body);
  res.status(201).json(await service.createMilestone(body));
}
export async function updateHandler(req: Request, res: Response) {
  const body = updateSchema.parse(req.body);
  res.json(await service.updateMilestone(req.params.id, body));
}
export async function deleteHandler(req: Request, res: Response) {
  await service.deleteMilestone(req.params.id);
  res.status(204).send();
}
