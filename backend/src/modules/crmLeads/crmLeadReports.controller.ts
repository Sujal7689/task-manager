import { Request, Response } from "express";
import { CrmActivityType } from "@prisma/client";
import { AppError } from "../../utils/appError";
import { toCsv } from "../../utils/csv";
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

// Every handler resolves the requester's CRM-Reports-specific visibility
// scope (Admin/Manager: null = unrestricted; Team Lead: their team; Staff:
// themselves) once and threads it into the service call alongside the
// user's free-text filter selection — see getCrmStaffScope's module comment.
async function getScope(req: Request) {
  return service.getCrmStaffScope(req.user!);
}

function parseStringParam(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}

async function parseFilters(req: Request): Promise<ReportFilters> {
  return {
    createdSince: parseDate(req.query.createdSince, "createdSince"),
    createdBefore: parseDate(req.query.createdBefore, "createdBefore"),
    staffName: parseStringParam(req.query.staffName),
    country: parseStringParam(req.query.country),
    leadQuality: parseStringParam(req.query.leadQuality),
    scope: await getScope(req),
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
      ...(await parseFilters(req)),
    }),
  );
}

export async function dailyReportHandler(req: Request, res: Response) {
  // "Today"/"yesterday" shift by the hour — never let a browser or proxy
  // cache serve a stale day's report.
  res.set("Cache-Control", "no-store");
  const staffName = parseStringParam(req.query.staffName);
  // `?from=&to=` are independently-chosen calendar days (a genuine From/To
  // pair, not forced to be adjacent) — the "completed"/"calls that
  // happened" side of the report reads from `from`, the "due"/"calls
  // scheduled" side reads from `to`. Both default to actual yesterday/today
  // when omitted.
  const fromDate = parseDate(req.query.from, "from");
  const toDate = parseDate(req.query.to, "to");
  const country = parseStringParam(req.query.country);
  const leadQuality = parseStringParam(req.query.leadQuality);
  res.json(await service.getDailyReport(staffName, await getScope(req), fromDate, toDate, country, leadQuality));
}

const LEAD_QUALITY_LABEL: Record<string, string> = {
  POTENTIAL_DEAL: "Potential Deal",
  NURTURING: "Nurturing",
  UNQUALIFIED: "Lead Unqualified",
};

export async function dailyReportLeadsCsvHandler(req: Request, res: Response) {
  const staffName = parseStringParam(req.query.staffName);
  const fromDate = parseDate(req.query.from, "from");
  const toDate = parseDate(req.query.to, "to");
  const country = parseStringParam(req.query.country);
  const leadQuality = parseStringParam(req.query.leadQuality);
  const report = await service.getDailyReport(staffName, await getScope(req), fromDate, toDate, country, leadQuality);

  const rows = report.leads.items.map((l) => ({
    Lead: l.leadName,
    Company: l.company ?? "",
    Staff: l.staff ?? "Unassigned",
    Status: l.status ?? "",
    "Call status": l.callStatus ?? "Not Started",
    "Call date & time": l.callAt ? new Date(l.callAt).toLocaleString() : "",
    "Next follow up": l.nextFollowUpAt ? new Date(l.nextFollowUpAt).toLocaleString() : "",
    "Next follow up type": l.nextFollowUpType ?? "",
    "Next follow up status": l.nextFollowUpStatus ?? "",
    Phone: l.phone ?? "",
    Country: l.country ?? "",
    "Lead Quality": l.leadQuality ? LEAD_QUALITY_LABEL[l.leadQuality] : "",
    Created: new Date(l.createdAt).toLocaleString(),
    "Latest note": l.latestNote ?? "",
  }));

  res.set("Content-Type", "text/csv");
  res.set("Content-Disposition", `attachment; filename="daily-report-leads.csv"`);
  res.send(toCsv(rows));
}

export async function closureReportHandler(req: Request, res: Response) {
  res.set("Cache-Control", "no-store");
  const period = req.query.period === "week" || req.query.period === "month" ? (req.query.period as ClosurePeriod) : ("day" as ClosurePeriod);
  const staffName = parseStringParam(req.query.staffName);
  const country = parseStringParam(req.query.country);
  const leadQuality = parseStringParam(req.query.leadQuality);
  res.json(await service.getClosureReport(period, staffName, await getScope(req), country, leadQuality));
}

export async function groupedByStaffHandler(req: Request, res: Response) {
  res.json(await service.getLeadsGroupedByStaff(await parseFilters(req)));
}

export async function activityFeedHandler(req: Request, res: Response) {
  res.json(
    await service.getActivityFeed({
      page: req.query.page ? Number(req.query.page) : undefined,
      pageSize: req.query.pageSize ? Number(req.query.pageSize) : undefined,
      type: parseActivityType(req.query.type),
      ...(await parseFilters(req)),
    }),
  );
}

export async function conversionRateHandler(req: Request, res: Response) {
  const granularity = req.query.granularity === "month" ? "month" : "day";
  res.json(await service.getConversionRate(granularity, await parseFilters(req)));
}

export async function stageWiseHandler(req: Request, res: Response) {
  res.json(await service.getStageWise(await parseFilters(req)));
}

export async function kanbanHandler(req: Request, res: Response) {
  res.json(
    await service.getKanbanBoard({
      search: typeof req.query.search === "string" ? req.query.search : undefined,
      ...(await parseFilters(req)),
    }),
  );
}

export async function leadsSelectorHandler(req: Request, res: Response) {
  res.json(await service.listLeadsForSelector(typeof req.query.search === "string" ? req.query.search : undefined, await parseFilters(req)));
}

export async function leadDetailHandler(req: Request, res: Response) {
  res.json(await service.getLeadDetail(req.params.id, parseActivityType(req.query.type), await getScope(req)));
}

export async function staffOverviewHandler(req: Request, res: Response) {
  res.json(await service.listStaffOverview(await parseFilters(req)));
}

export async function staffDetailHandler(req: Request, res: Response) {
  res.json(await service.getStaffDetail(req.params.staffName, await parseFilters(req)));
}

export async function countriesHandler(req: Request, res: Response) {
  res.json(await service.getDistinctCountries(await getScope(req)));
}

export async function updateLeadQualityHandler(req: Request, res: Response) {
  const quality = req.body?.quality;
  if (quality !== null && typeof quality !== "string") {
    throw new AppError(400, "Body must be { quality: string | null }");
  }
  res.json(await service.setLeadQuality(req.params.id, quality, await getScope(req)));
}
