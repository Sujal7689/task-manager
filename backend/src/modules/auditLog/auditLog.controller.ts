import { Request, Response } from "express";
import * as service from "./auditLog.service";
import { parsePagination, parseSearch, toPaginated } from "../../utils/pagination";

export async function listHandler(req: Request, res: Response) {
  const { entityType, entityId } = req.query as { entityType?: string; entityId?: string };
  const search = parseSearch(req.query);
  const pagination = parsePagination(req.query);
  if (!pagination) {
    return res.json(await service.listAuditLog({ entityType, entityId, search }));
  }
  const { items, total } = (await service.listAuditLog({ entityType, entityId, search }, pagination)) as {
    items: unknown[];
    total: number;
  };
  res.json(toPaginated(items, total, pagination.page, pagination.pageSize));
}
