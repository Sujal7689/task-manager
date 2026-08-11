import { Request, Response } from "express";
import { z } from "zod";
import { ActivityLogStatus, ActivityType } from "@prisma/client";
import * as service from "./dailyActivities.service";
import { AppError } from "../../utils/appError";
import { parsePagination } from "../../utils/pagination";

const createSchema = z.object({
  activityType: z.nativeEnum(ActivityType),
  status: z.nativeEnum(ActivityLogStatus).optional(),
  activityDate: z.string().min(1),
  timeIn: z.string().optional(),
  timeOut: z.string().optional(),
  workingHours: z.number().optional(),
  isManualOverride: z.boolean().optional(),
  overrideReason: z.string().optional(),
  description: z.string().optional(),
  projectId: z.string().optional(),
  departmentId: z.string().optional(),
});

const rangeSchema = z.object({ from: z.string().optional(), to: z.string().optional() });

export async function createHandler(req: Request, res: Response) {
  const body = createSchema.parse(req.body);
  res.status(201).json(await service.createDailyActivity(body, req.user!.id));
}

export async function listMineHandler(req: Request, res: Response) {
  const { from, to } = rangeSchema.parse(req.query);
  const pagination = parsePagination(req.query);
  if (!pagination) {
    return res.json(await service.listMyDailyActivities(req.user!.id, { from, to }));
  }
  const { items, total } = (await service.listMyDailyActivities(req.user!.id, { from, to }, pagination)) as {
    items: unknown[];
    total: number;
  };
  res.json({ data: items, total, page: pagination.page, pageSize: pagination.pageSize, totalPages: Math.ceil(total / pagination.pageSize) });
}

export async function listTeamHandler(req: Request, res: Response) {
  const { from, to } = rangeSchema.parse(req.query);
  const pagination = parsePagination(req.query);
  if (!pagination) {
    return res.json(await service.listTeamDailyActivities(req.user!, { from, to }));
  }
  const { items, total } = (await service.listTeamDailyActivities(req.user!, { from, to }, pagination)) as {
    items: unknown[];
    total: number;
  };
  res.json({ data: items, total, page: pagination.page, pageSize: pagination.pageSize, totalPages: Math.ceil(total / pagination.pageSize) });
}

export async function uploadAttachmentHandler(req: Request, res: Response) {
  if (!req.file) throw new AppError(400, "No file uploaded (field name: 'file')");
  const attachment = await service.addDailyActivityAttachment(req.params.id, {
    fileName: req.file.originalname,
    filePath: `uploads/daily-activities/${req.file.filename}`,
    fileSize: req.file.size,
    mimeType: req.file.mimetype,
  });
  res.status(201).json(attachment);
}
