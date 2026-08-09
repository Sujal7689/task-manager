import { Request, Response } from "express";
import { z } from "zod";
import { ProjectStatus } from "@prisma/client";
import * as service from "./projects.service";
import { parsePagination, parseSearch, toPaginated } from "../../utils/pagination";
import { runWithUser } from "../../utils/requestContext";

const createSchema = z.object({
  name: z.string().min(1),
  companyId: z.string().min(1),
  departmentId: z.string().min(1),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  ownerId: z.string().min(1),
  status: z.nativeEnum(ProjectStatus).optional(),
});
const updateSchema = createSchema.partial();

export async function listHandler(req: Request, res: Response) {
  const pagination = parsePagination(req.query);
  if (!pagination) {
    return res.json(await runWithUser(req.user!.id, () => service.listProjects()));
  }
  const search = parseSearch(req.query);
  const { items, total } = (await runWithUser(req.user!.id, () => service.listProjects({ ...pagination, search }))) as { items: unknown[]; total: number };
  res.json(toPaginated(items, total, pagination.page, pagination.pageSize));
}
export async function getHandler(req: Request, res: Response) {
  res.json(await runWithUser(req.user!.id, () => service.getProject(req.params.id)));
}
export async function createHandler(req: Request, res: Response) {
  const body = createSchema.parse(req.body);
  res.status(201).json(await runWithUser(req.user!.id, () => service.createProject(body)));
}
export async function updateHandler(req: Request, res: Response) {
  const body = updateSchema.parse(req.body);
  res.json(await runWithUser(req.user!.id, () => service.updateProject(req.params.id, body)));
}
export async function deleteHandler(req: Request, res: Response) {
  await runWithUser(req.user!.id, () => service.deleteProject(req.params.id));
  res.status(204).send();
}
