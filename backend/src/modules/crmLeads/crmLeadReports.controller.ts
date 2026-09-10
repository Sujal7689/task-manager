import { Request, Response } from "express";
import { CrmActivityType } from "@prisma/client";
import { AppError } from "../../utils/appError";
import * as service from "./crmLeadReports.service";
import { ReportFilters, ClosurePeriod } from "./crmLeadReports.service";

function parseActivityType(value: unknown): CrmActivityType | undefined {
  if (typeof value !== "string" || !value) return undefined;
  const upper = value.toUpperCase();
  if (!Object.values(CrmActivityType).includes(upper as CrmActivityType)) {
    throw new AppError(400, `Invalid activity type "${value}"`);
  }
  return upper as CrmActivityType;
}

// Shared date-range + staff toggle applied across every tab (frontend:
// CrmReports/leadDateFilter.ts). `?createdSince=2026-08-01&createdBefore=
// 2026-09-01&staffName=Harsh%20Singhania`; any of the three may be absent.
// `staffName` is the Lead's "Staff Name" custom field, not Owner — see
// crmLeadReports.service.ts's module comment for why.
function parseDate(value: unknown, label: string): Date | undefined {
  if (typeof value !== "string" || !value) return undefined;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw new AppError(400, `Invalid ${label} date "${value}"`);
  return d;
}

function parseFilters(query: Request["query"]): ReportFilters {
  return {
    createdSince: parseDate(query.createdSince, "createdSince"),
    createdBefore: parseDate(query.createdBefore, "createdBefore"),
    staffName: typeof query.staffName === "string" && query.staffName ? query.staffName : undefined,
  };
}

export async function assignmentOverviewHandler(req: Request, res: Response) {
  res.json(
    await service.getAssignmentOverview({
      page: req.query.page ? Number(req.query.page) : undefined,
      pageSize: req.query.pageSize ? Number(req.query.pageSize) : undefined,
      search: typeof req.query.search === "string" ? req.query.search : undefined,
      sortBy: typeof req.query.sortBy === "string" ? req.query.sortBy : undefined,
      sortDir: req.query.sortDir === "asc" ? "asc" : "desc",
      ...parseFilters(req.query),
    }),
  );
}

export async function dailyReportHandler(req: Request, res: Response) {
  // "Today"/"yesterday" shift by the hour — never let a browser or proxy
  // cache serve a stale day's report.
  res.set("Cache-Control", "no-store");
  const staffName = typeof req.query.staffName === "string" && req.query.staffName ? req.query.staffName : undefined;
  res.json(await service.getDailyReport(staffName));
}

export async function closureReportHandler(req: Request, res: Response) {
  res.set("Cache-Control", "no-store");
  const period = req.query.period === "week" || req.query.period === "month" ? (req.query.period as ClosurePeriod) : ("day" as ClosurePeriod);
  const staffName = typeof req.query.staffName === "string" && req.query.staffName ? req.query.staffName : undefined;
  res.json(await service.getClosureReport(period, staffName));
}

export async function groupedByStaffHandler(req: Request, res: Response) {
  res.json(await service.getLeadsGroupedByStaff(parseFilters(req.query)));
}

export async function activityFeedHandler(req: Request, res: Response) {
  res.json(
    await service.getActivityFeed({
      page: req.query.page ? Number(req.query.page) : undefined,
      pageSize: req.query.pageSize ? Number(req.query.pageSize) : undefined,
      type: parseActivityType(req.query.type),
      ...parseFilters(req.query),
    }),
  );
}

export async function conversionRateHandler(req: Request, res: Response) {
  const granularity = req.query.granularity === "month" ? "month" : "day";
  res.json(await service.getConversionRate(granularity, parseFilters(req.query)));
}

export async function stageWiseHandler(req: Request, res: Response) {
  res.json(await service.getStageWise(parseFilters(req.query)));
}

export async function kanbanHandler(req: Request, res: Response) {
  res.json(
    await service.getKanbanBoard({
      search: typeof req.query.search === "string" ? req.query.search : undefined,
      ...parseFilters(req.query),
    }),
  );
}

export async function leadsSelectorHandler(req: Request, res: Response) {
  res.json(await service.listLeadsForSelector(typeof req.query.search === "string" ? req.query.search : undefined, parseFilters(req.query)));
}

export async function leadDetailHandler(req: Request, res: Response) {
  res.json(await service.getLeadDetail(req.params.id, parseActivityType(req.query.type)));
}

export async function staffOverviewHandler(req: Request, res: Response) {
  res.json(await service.listStaffOverview(parseFilters(req.query)));
}

export async function staffDetailHandler(req: Request, res: Response) {
  res.json(await service.getStaffDetail(req.params.staffName, parseFilters(req.query)));
}
