import { Request, Response } from "express";
import { z } from "zod";
import { Role, UserStatus } from "@prisma/client";
import * as usersService from "./users.service";

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
  phone: z.string().optional(),
  role: z.nativeEnum(Role).optional(),
  departmentId: z.string().nullable().optional(),
  companyId: z.string().nullable().optional(),
  reportingManagerId: z.string().nullable().optional(),
  status: z.nativeEnum(UserStatus).optional(),
  isZohoFallbackAssignee: z.boolean().optional(),
});

export async function listHandler(_req: Request, res: Response) {
  res.json(await usersService.listUsers());
}

export async function getHandler(req: Request, res: Response) {
  res.json(await usersService.getUser(req.params.id));
}

export async function createHandler(req: Request, res: Response) {
  const body = createSchema.parse(req.body);
  res.status(201).json(await usersService.createUser(body));
}

export async function updateHandler(req: Request, res: Response) {
  const body = updateSchema.parse(req.body);
  res.json(await usersService.updateUser(req.params.id, body));
}

export async function deleteHandler(req: Request, res: Response) {
  await usersService.deleteUser(req.params.id, req.user!.id);
  res.status(204).send();
}
