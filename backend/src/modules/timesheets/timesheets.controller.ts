import { Request, Response } from "express";
import { z } from "zod";
import { TimesheetEntryType } from "@prisma/client";
import * as service from "./timesheets.service";
import { parsePagination, parseSearch, toPaginated } from "../../utils/pagination";

const rangeSchema = z.object({ from: z.string().min(1), to: z.string().min(1) });
const manualEntrySchema = z.object({
  date: z.string().min(1),
  hoursLogged: z.number().positive(),
  entryType: z.enum(["MEETING", "ADMIN", "LEAVE", "BREAK"]),
});

export async function myTimesheetHandler(req: Request, res: Response) {
  const { from, to } = rangeSchema.parse(req.query);
  const pagination = parsePagination(req.query);
  if (!pagination) {
    return res.json(await service.getUserTimesheet(req.user!.id, from, to));
  }
  const search = parseSearch(req.query);
  const { items, total } = (await service.getUserTimesheet(req.user!.id, from, to, { ...pagination, search })) as {
    items: unknown[];
    total: number;
  };
  res.json(toPaginated(items, total, pagination.page, pagination.pageSize));
}

export async function createManualEntryHandler(req: Request, res: Response) {
  const body = manualEntrySchema.parse(req.body);
  res.status(201).json(
    await service.createManualEntry(req.user!.id, { ...body, entryType: body.entryType as Exclude<TimesheetEntryType, "TASK_WORK"> }),
  );
}

export async function teamTimesheetHandler(req: Request, res: Response) {
  const { from, to } = rangeSchema.parse(req.query);
  const pagination = parsePagination(req.query);
  if (!pagination) {
    return res.json(await service.getTeamTimesheet(req.user!, from, to));
  }
  const search = parseSearch(req.query);
  const { items, total } = (await service.getTeamTimesheet(req.user!, from, to, { ...pagination, search })) as {
    items: unknown[];
    total: number;
  };
  res.json(toPaginated(items, total, pagination.page, pagination.pageSize));
}
