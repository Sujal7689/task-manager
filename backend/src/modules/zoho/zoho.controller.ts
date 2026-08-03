import { Request, Response } from "express";
import * as service from "./zoho.service";

export async function statusHandler(_req: Request, res: Response) {
  res.json(await service.getConnectionStatus());
}

export async function syncLogHandler(_req: Request, res: Response) {
  res.json(await service.listSyncLog());
}

export async function triggerSyncHandler(_req: Request, res: Response) {
  const result = await service.runZohoSync();
  res.json(result);
}
