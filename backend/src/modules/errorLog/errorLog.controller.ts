import { Request, Response } from "express";
import * as service from "./errorLog.service";
import { parsePagination, parseSearch, toPaginated } from "../../utils/pagination";

export async function listHandler(req: Request, res: Response) {
  const search = parseSearch(req.query);
  const pagination = parsePagination(req.query);
  if (!pagination) {
    return res.json(await service.listErrorLog({ search }));
  }
  const { items, total } = (await service.listErrorLog({ search }, pagination)) as { items: unknown[]; total: number };
  res.json(toPaginated(items, total, pagination.page, pagination.pageSize));
}

export async function clearHandler(_req: Request, res: Response) {
  await service.clearErrorLog();
  res.status(204).send();
}
