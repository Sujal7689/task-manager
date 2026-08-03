import { Request, Response } from "express";
import * as service from "./notifications.service";

export async function listHandler(req: Request, res: Response) {
  res.json(await service.listForUser(req.user!.id));
}

export async function unreadCountHandler(req: Request, res: Response) {
  res.json({ count: await service.unreadCount(req.user!.id) });
}

export async function markReadHandler(req: Request, res: Response) {
  res.json(await service.markRead(req.params.id, req.user!.id));
}

export async function markAllReadHandler(req: Request, res: Response) {
  await service.markAllRead(req.user!.id);
  res.status(204).send();
}
