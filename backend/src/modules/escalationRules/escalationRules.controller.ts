import { Request, Response } from "express";
import { z } from "zod";
import * as service from "./escalationRules.service";

const createSchema = z.object({
  companyId: z.string().optional(),
  departmentId: z.string().optional(),
  overdueDay: z.number().int().positive(),
  notifyDepartmentHead: z.boolean().optional(),
});

export async function listHandler(_req: Request, res: Response) {
  res.json(await service.listEscalationRules());
}
export async function createHandler(req: Request, res: Response) {
  const body = createSchema.parse(req.body);
  res.status(201).json(await service.createEscalationRule(body));
}
export async function deleteHandler(req: Request, res: Response) {
  await service.deleteEscalationRule(req.params.id);
  res.status(204).send();
}
