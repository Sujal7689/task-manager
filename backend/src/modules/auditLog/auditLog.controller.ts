import { Request, Response } from "express";
import * as service from "./auditLog.service";

export async function listHandler(req: Request, res: Response) {
  const { entityType, entityId } = req.query as { entityType?: string; entityId?: string };
  res.json(await service.listAuditLog({ entityType, entityId }));
}
