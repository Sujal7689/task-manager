import { Request, Response } from "express";
import * as service from "./crmLeads.service";

export async function statusHandler(_req: Request, res: Response) {
  res.json(await service.getCrmLeadsSyncStatus());
}

export async function syncLogHandler(_req: Request, res: Response) {
  res.json(await service.listCrmLeadSyncLog());
}

// `?full=true` re-runs the whole Leads module (Section 4.1 backfill) instead
// of the default incremental fetch (Section 4.2) — same distinction the
// Admin UI exposes as two separate buttons.
export async function triggerSyncHandler(req: Request, res: Response) {
  const full = req.query.full === "true";
  const result = await service.runCrmLeadsSync({ full });
  res.json(result);
}
