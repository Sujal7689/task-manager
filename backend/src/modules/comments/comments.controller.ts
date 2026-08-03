import { Request, Response } from "express";
import { z } from "zod";
import * as service from "./comments.service";
import * as tasksService from "../tasks/tasks.service";

const createSchema = z.object({
  taskId: z.string().min(1),
  body: z.string().min(1),
  mentionedUserIds: z.array(z.string()).optional(),
});

export async function listHandler(req: Request, res: Response) {
  await tasksService.getTask(req.params.taskId, req.user!);
  res.json(await service.listComments(req.params.taskId));
}

export async function createHandler(req: Request, res: Response) {
  const body = createSchema.parse(req.body);
  await tasksService.getTask(body.taskId, req.user!);
  res.status(201).json(await service.createComment({ ...body, authorId: req.user!.id }));
}
