import { Request, Response } from "express";
import { z } from "zod";
import { Role, UserStatus } from "@prisma/client";
import * as usersService from "./users.service";
import { parsePagination, parseSearch, toPaginated } from "../../utils/pagination";
import { runWithUser } from "../../utils/requestContext";

const createSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
  phone: z.string().optional(),
  role: z.nativeEnum(Role),
  departmentId: z.string().optional(),
  companyId: z.string().optional(),
  reportingManagerId: z.string().optional(),
  isZohoFallbackAssignee: z.boolean().optional(),
});

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  password: z.string().min(8).optional(),
  phone: z.string().optional(),
  role: z.nativeEnum(Role).optional(),
  departmentId: z.string().nullable().optional(),
  companyId: z.string().nullable().optional(),
  reportingManagerId: z.string().nullable().optional(),
  status: z.nativeEnum(UserStatus).optional(),
  isZohoFallbackAssignee: z.boolean().optional(),
});

export async function listHandler(req: Request, res: Response) {
  const pagination = parsePagination(req.query);
  if (!pagination) {
    return res.json(await runWithUser(req.user!.id, () => usersService.listUsers()));
  }
  const search = parseSearch(req.query);
  const { items, total } = (await runWithUser(req.user!.id, () => usersService.listUsers({ ...pagination, search }))) as { items: unknown[]; total: number };
  res.json(toPaginated(items, total, pagination.page, pagination.pageSize));
}

export async function getHandler(req: Request, res: Response) {
  res.json(await runWithUser(req.user!.id, () => usersService.getUser(req.params.id)));
}

export async function createHandler(req: Request, res: Response) {
  const body = createSchema.parse(req.body);
  res.status(201).json(await runWithUser(req.user!.id, () => usersService.createUser(body)));
}

export async function updateHandler(req: Request, res: Response) {
  const body = updateSchema.parse(req.body);
  res.json(await runWithUser(req.user!.id, () => usersService.updateUser(req.params.id, body)));
}

export async function deleteHandler(req: Request, res: Response) {
  await runWithUser(req.user!.id, () => usersService.deleteUser(req.params.id, req.user!.id));
  res.status(204).send();
}
