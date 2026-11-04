import { Request, Response } from "express";
import { z } from "zod";
import { LeaveType } from "@prisma/client";
import * as service from "./attendance.service";
import { toCsv } from "../../utils/csv";

const rangeSchema = z.object({ from: z.string().min(1), to: z.string().min(1), userId: z.string().optional() });
const reportSchema = rangeSchema.extend({ format: z.enum(["json", "csv"]).default("json") });

// Location is mandatory: attendance must prove where the person was. Enforced
// here (not only in the browser) so a direct API call can't skip it.
const LOCATION_REQUIRED = "Location is required to check in or out. Allow location access in your browser and try again.";
const gpsLocationSchema = z.object(
  {
    lat: z.number({ required_error: LOCATION_REQUIRED, invalid_type_error: LOCATION_REQUIRED }).finite().min(-90).max(90),
    lng: z.number({ required_error: LOCATION_REQUIRED, invalid_type_error: LOCATION_REQUIRED }).finite().min(-180).max(180),
  },
  { required_error: LOCATION_REQUIRED, invalid_type_error: LOCATION_REQUIRED },
);
const checkActionSchema = z.object({ location: gpsLocationSchema });

export async function checkInHandler(req: Request, res: Response) {
  const { location } = checkActionSchema.parse(req.body ?? {});
  res.status(201).json(await service.checkIn(req.user!.id, location));
}

export async function checkOutHandler(req: Request, res: Response) {
  const { location } = checkActionSchema.parse(req.body ?? {});
  res.json(await service.checkOut(req.user!.id, location));
}

export async function todayHandler(req: Request, res: Response) {
  res.json(await service.getTodayAttendance(req.user!.id));
}

const updateAttendanceSchema = z.object({
  checkInAt: z.string().optional(),
  checkOutAt: z.string().nullable().optional(),
});

export async function updateAttendanceHandler(req: Request, res: Response) {
  const body = updateAttendanceSchema.parse(req.body);
  res.json(await service.updateAttendance(req.params.id, body, req.user!));
}

export async function myAttendanceHandler(req: Request, res: Response) {
  const { from, to } = rangeSchema.parse(req.query);
  res.json(await service.getMyAttendance(req.user!.id, from, to));
}

export async function teamAttendanceHandler(req: Request, res: Response) {
  const { from, to, userId } = rangeSchema.parse(req.query);
  res.json(await service.getTeamAttendance(req.user!, from, to, userId));
}

export async function visibleUsersHandler(req: Request, res: Response) {
  res.json(await service.getVisibleAttendanceUsers(req.user!));
}

export async function monthlyReportHandler(req: Request, res: Response) {
  const { from, to, format } = reportSchema.parse(req.query);
  const rows = await service.getMonthlyAttendanceReport(req.user!, from, to);
  if (format === "csv") {
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", 'attachment; filename="attendance-report.csv"');
    return res.send(toCsv(rows as unknown as Record<string, unknown>[]));
  }
  res.json(rows);
}

const createLeaveSchema = z.object({
  leaveType: z.nativeEnum(LeaveType),
  startDate: z.string().min(1),
  endDate: z.string().min(1),
  reason: z.string().optional(),
  targetUserId: z.string().optional(),
});

export async function createLeaveHandler(req: Request, res: Response) {
  const body = createLeaveSchema.parse(req.body);
  res.status(201).json(await service.createLeave(req.user!, body));
}

const updateLeaveSchema = z.object({
  leaveType: z.nativeEnum(LeaveType).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  reason: z.string().nullable().optional(),
});

export async function updateLeaveHandler(req: Request, res: Response) {
  const body = updateLeaveSchema.parse(req.body);
  res.json(await service.updateLeave(req.params.id, body, req.user!));
}

export async function deleteLeaveHandler(req: Request, res: Response) {
  await service.deleteLeave(req.params.id, req.user!);
  res.status(204).send();
}

export async function myLeavesHandler(req: Request, res: Response) {
  const { from, to } = rangeSchema.parse(req.query);
  res.json(await service.getMyLeaves(req.user!.id, from, to));
}

export async function teamLeavesHandler(req: Request, res: Response) {
  const { from, to, userId } = rangeSchema.parse(req.query);
  res.json(await service.getTeamLeaves(req.user!, from, to, userId));
}
