import { CrmActivityType, CrmLeadQuality, Prisma, Role } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { AppError } from "../../utils/appError";
import { FUNNEL_ORDER } from "./funnelStage";
import { getDirectReportIds } from "../users/users.service";

// ---------------------------------------------------------------------------
// Leads + Reports spec, Section 5: landing page widgets + Lead-wise/Staff-wise
// tabs, all read-only over the tables populated by crmLeads.service.ts.
// Confirmed with the client: conversion rate is same-period (leads converted
// in a period / leads created in that same period), and the funnel groups
// Lead_Status into the 5-stage + dropped/other split in funnelStage.ts.
//
// Every list/aggregate below accepts an optional `createdSince`/`createdBefore`
// date range and an optional `staffName` filter — both applied uniformly
// across every tab via a shared control in CrmReportsHub.
//
// `staffName` is the client's custom "Staff Name" picklist field on the Lead
// (Zoho API name `Staff_Name`) — the actual field of record for "who's
// working this lead". It is deliberately NOT the same as `ownerName` (the
// standard Zoho `Owner` field): in this org, Owner doesn't reliably track
// the assigned staff member, so every staff-level filter/grouping below is
// keyed on `staffName` instead. `ownerName` is still synced and still shown
// as "Owner" on the lead detail page, purely informational.
//
// One nuance worth flagging: for activity-level queries (Activity Feed,
// Daily Report, Closure Report's "activities closed"), the staff filter
// matches `actorName` — who actually performed that piece of work — not the
// lead's staffName, since those can genuinely differ (a lead can be staffed
// to one rep while another logs calls against it). For lead-level queries
// (Assignment Overview, Conversion Rate, Stage-wise, Kanban, Closure
// Report's "deals converted"), it matches the lead's own `staffName`, since
// that's a property of the lead, not of an individual action taken on it.
//
// -------------------- Role-based visibility scope --------------------
// Client direction, CRM Reports page ONLY (does not change scoping anywhere
// else in the app): Admin/Manager see everything; Team Lead sees only their
// own team; Staff sees only their own reports. "Team" reuses the same
// reportingManagerId-based direct-reports rule already used for Task/
// Timesheet/Attendance scoping (users.service.ts's getDirectReportIds) —
// not a new convention. The wrinkle is that CrmLead has no FK to User at
// all: `staffName`/`actorName` are free-text values synced from Zoho's
// Staff Name picklist. So scoping works by resolving the allowed User ids
// to their `name` values and matching on that string — a fuzzy join (it
// depends on the Zoho picklist value matching User.name exactly), not a
// real foreign key. Good enough for report visibility; a mismatched name
// would just make that person's data invisible to themselves, fail-closed
// rather than fail-open.
// ---------------------------------------------------------------------------

export interface ScopedRequester {
  id: string;
  role: Role;
}

export async function getCrmStaffScope(user: ScopedRequester): Promise<string[] | null> {
  if (user.role === Role.ADMIN || user.role === Role.MANAGER) return null; // unrestricted
  const ids = user.role === Role.TEAM_LEAD ? [...(await getDirectReportIds(user.id)), user.id] : [user.id];
  const rows = await prisma.user.findMany({ where: { id: { in: ids } }, select: { name: true } });
  return rows.map((r) => r.name);
}

// Combines a free-text staff filter selection with the requester's role-based
// scope: `scope: null` = unrestricted (plain equality, or no filter at all).
// A requested name outside the caller's scope resolves to `{ in: [] }` —
// fails closed (matches no rows) instead of silently ignoring the boundary.
function scopedNameFilter(requested: string | undefined, scope: string[] | null | undefined): string | { in: string[] } | undefined {
  if (!scope) return requested;
  if (requested) return scope.includes(requested) ? requested : { in: [] };
  return { in: scope };
}

// Same combinator for the raw-SQL conversion-rate query.
function scopedStaffSqlFragment(requested: string | undefined, scope: string[] | null | undefined): Prisma.Sql {
  const cond = scopedNameFilter(requested, scope);
  if (cond === undefined) return Prisma.empty;
  if (typeof cond === "string") return Prisma.sql` AND "staff_name" = ${cond}`;
  if (cond.in.length === 0) return Prisma.sql` AND false`;
  return Prisma.sql` AND "staff_name" = ANY(${cond.in})`;
}

type StaffNameCond = string | { in: string[] } | undefined;
type StaffNameWhere = string | null | { in: string[] } | { not: null } | undefined;

// Folds the new Assigned/Unassigned filter into whatever staffName condition
// a staff-filter/scope selection already produced, rather than building two
// independent `{ staffName: ... }` fragments that would silently clobber
// each other when spread into the same `where` object (both target the same
// Prisma field). "Unassigned" + an already-narrowed staffCond (a specific
// staff chosen, or a scoped Team Lead/Staff role) is a genuine
// contradiction — a real name is never "unassigned" — so it fails closed
// (`{ in: [] }`) instead of silently picking one side. "Assigned" simply
// narrows further to non-null when nothing else already narrowed it.
function resolveStaffNameWhere(staffCond: StaffNameCond, assignment: string | undefined): StaffNameWhere {
  if (assignment === "unassigned") return staffCond !== undefined ? { in: [] } : null;
  if (assignment === "assigned") return staffCond !== undefined ? staffCond : { not: null };
  return staffCond;
}

// Raw-SQL equivalent for the conversion-rate query's staff_name column.
function assignmentSqlFragment(assignment: string | undefined): Prisma.Sql {
  if (assignment === "unassigned") return Prisma.sql` AND "staff_name" IS NULL`;
  if (assignment === "assigned") return Prisma.sql` AND "staff_name" IS NOT NULL`;
  return Prisma.empty;
}

const PAGE_SIZE_DEFAULT = 25;
const PAGE_SIZE_MAX = 100;

function clampPageSize(pageSize?: number): number {
  if (!pageSize || pageSize < 1) return PAGE_SIZE_DEFAULT;
  return Math.min(pageSize, PAGE_SIZE_MAX);
}

// Shared date-range fragment for any query filtering on the lead's own
// `zohoCreatedTime` — `createdBefore` is exclusive, matching `createdSince`
// being inclusive (a lead created exactly at the boundary counts as "since").
function leadDateRange(since?: Date, before?: Date): { gte?: Date; lt?: Date } | undefined {
  if (!since && !before) return undefined;
  return { ...(since ? { gte: since } : {}), ...(before ? { lt: before } : {}) };
}

export interface ReportFilters {
  createdSince?: Date;
  createdBefore?: Date;
  staffName?: string;
  scope?: string[] | null;
  // Both plain equality — no scope/fuzzy-matching involved (unlike
  // staffName), since neither is a visibility boundary, just a narrowing
  // filter available uniformly across every CRM Reports tab.
  country?: string;
  leadQuality?: string;
  // "assigned" | "unassigned" | undefined (any other value ignored) — see
  // resolveStaffNameWhere for how this combines with staffName/scope.
  assignment?: string;
}

function isLeadQuality(value: string | undefined): value is CrmLeadQuality {
  return value === "POTENTIAL_DEAL" || value === "NURTURING" || value === "UNQUALIFIED";
}

// Shared country/quality narrowing, applied everywhere staffName already is.
function leadRefineWhere(country?: string, leadQuality?: string): Prisma.CrmLeadWhereInput {
  return {
    ...(country ? { country } : {}),
    ...(isLeadQuality(leadQuality) ? { leadQuality } : {}),
  };
}

// -------------------- Widget 1: Assignment overview --------------------

const ASSIGNMENT_SORT_FIELDS = ["fullName", "staffName", "funnelStage", "lastActivityAt", "zohoCreatedTime"] as const;
type AssignmentSortField = (typeof ASSIGNMENT_SORT_FIELDS)[number];

export interface AssignmentOverviewParams extends ReportFilters {
  page?: number;
  pageSize?: number;
  search?: string;
  sortBy?: string;
  sortDir?: "asc" | "desc";
}

export async function getAssignmentOverview(params: AssignmentOverviewParams) {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = clampPageSize(params.pageSize);
  const sortBy: AssignmentSortField = ASSIGNMENT_SORT_FIELDS.includes(params.sortBy as AssignmentSortField)
    ? (params.sortBy as AssignmentSortField)
    : "lastActivityAt";
  const sortDir = params.sortDir === "asc" ? "asc" : "desc";

  const dateRange = leadDateRange(params.createdSince, params.createdBefore);
  const staffCond = scopedNameFilter(params.staffName, params.scope);
  const staffNameWhere = resolveStaffNameWhere(staffCond, params.assignment);
  const where: Prisma.CrmLeadWhereInput = {
    ...(dateRange ? { zohoCreatedTime: dateRange } : {}),
    ...(staffNameWhere !== undefined ? { staffName: staffNameWhere } : {}),
    ...leadRefineWhere(params.country, params.leadQuality),
    ...(params.search
      ? {
          OR: [
            { fullName: { contains: params.search, mode: "insensitive" } },
            { company: { contains: params.search, mode: "insensitive" } },
            { staffName: { contains: params.search, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [total, leads] = await Promise.all([
    prisma.crmLead.count({ where }),
    prisma.crmLead.findMany({
      where,
      orderBy: { [sortBy]: sortDir },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        ownerHistory: { orderBy: { changedAt: "desc" }, take: 1 },
        activities: { orderBy: { occurredAt: "desc" }, take: 1 },
      },
    }),
  ]);

  return {
    total,
    page,
    pageSize,
    rows: leads.map((l) => ({
      id: l.id,
      fullName: l.fullName,
      company: l.company,
      funnelStage: l.funnelStage,
      staffName: l.staffName,
      ownerName: l.ownerName,
      assignedAt: l.ownerHistory[0]?.changedAt ?? l.zohoCreatedTime,
      lastActivity: l.activities[0]
        ? { type: l.activities[0].activityType, summary: l.activities[0].summary, occurredAt: l.activities[0].occurredAt }
        : null,
      lastActivityAt: l.lastActivityAt,
    })),
  };
}

// -------------------- Grouped-by-staff view (Dashboard) --------------------
// Every lead nested under a collapsible section per staff member — an
// alternative to the flat/paginated Assignment Overview widget for "what
// does each person's list actually look like", modeled on a grouped list
// view from another in-house tool the client already uses day to day.

export async function getLeadsGroupedByStaff(filters: ReportFilters = {}) {
  const dateRange = leadDateRange(filters.createdSince, filters.createdBefore);
  const staffCond = scopedNameFilter(filters.staffName, filters.scope);
  const staffNameWhere = resolveStaffNameWhere(staffCond, filters.assignment);
  const where: Prisma.CrmLeadWhereInput = {
    ...(dateRange ? { zohoCreatedTime: dateRange } : {}),
    ...(staffNameWhere !== undefined ? { staffName: staffNameWhere } : {}),
    ...leadRefineWhere(filters.country, filters.leadQuality),
  };
  const leads = await prisma.crmLead.findMany({
    where,
    select: {
      id: true,
      fullName: true,
      company: true,
      phone: true,
      leadSource: true,
      leadStatus: true,
      funnelStage: true,
      staffName: true,
      country: true,
      leadQuality: true,
      zohoCreatedTime: true,
    },
    orderBy: { zohoCreatedTime: "desc" },
    take: 2000, // safety cap — fine at this org's current scale
  });

  const byStaff = new Map<string, { staffName: string | null; leads: typeof leads }>();
  for (const l of leads) {
    const key = l.staffName ?? "(unassigned)";
    const entry = byStaff.get(key) ?? { staffName: l.staffName, leads: [] };
    entry.leads.push(l);
    byStaff.set(key, entry);
  }

  return Array.from(byStaff.entries())
    .map(([key, { staffName, leads }]) => ({ staffName: staffName ?? key, count: leads.length, leads }))
    .sort((a, b) => b.count - a.count);
}

// -------------------- Widget 2: Latest activity feed --------------------

export async function getActivityFeed(params: { page?: number; pageSize?: number; type?: CrmActivityType } & ReportFilters) {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = clampPageSize(params.pageSize);
  const dateRange = leadDateRange(params.createdSince, params.createdBefore);
  // Staff filter here matches who *performed* the activity, not the lead's staffName.
  const actorCond = scopedNameFilter(params.staffName, params.scope);
  // Country/quality are lead-level, so they narrow via the parent lead
  // regardless of who performed the activity — combined into one `lead`
  // sub-filter alongside the date range instead of two separate spreads,
  // since Prisma would otherwise let a later `lead: {...}` clobber an
  // earlier one rather than merging them.
  // Assignment is a lead-level property too (unlike the staff filter above,
  // which targets actorName) — no staffCond competing for this same nested
  // field here, so it can just fold straight in.
  const assignmentWhere = resolveStaffNameWhere(undefined, params.assignment);
  const leadFilter: Prisma.CrmLeadWhereInput = {
    ...(dateRange ? { zohoCreatedTime: dateRange } : {}),
    ...leadRefineWhere(params.country, params.leadQuality),
    ...(assignmentWhere !== undefined ? { staffName: assignmentWhere } : {}),
  };
  const where: Prisma.CrmLeadActivityWhereInput = {
    ...(params.type ? { activityType: params.type } : {}),
    ...(actorCond !== undefined ? { actorName: actorCond } : {}),
    ...(Object.keys(leadFilter).length > 0 ? { lead: leadFilter } : {}),
  };

  const [total, rows] = await Promise.all([
    prisma.crmLeadActivity.count({ where }),
    prisma.crmLeadActivity.findMany({
      where,
      orderBy: { occurredAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { lead: { select: { id: true, fullName: true, company: true } } },
    }),
  ]);

  return {
    total,
    page,
    pageSize,
    rows: rows.map((r) => ({
      id: r.id,
      leadId: r.leadId,
      leadName: r.lead.fullName ?? r.lead.company ?? "(unnamed lead)",
      type: r.activityType,
      actorName: r.actorName,
      summary: r.summary,
      occurredAt: r.occurredAt,
    })),
  };
}

// -------------------- Widget 3: Conversion rate (same-period) --------------------

interface PeriodCount {
  period: Date;
  count: bigint;
}

export async function getConversionRate(granularity: "day" | "month", filters: ReportFilters = {}) {
  const { createdSince, createdBefore, staffName, scope, country, leadQuality, assignment } = filters;
  const rollingWindowStart = granularity === "day" ? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) : new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
  // The rolling window and the client's cutoff both narrow the range — use
  // whichever is later, so turning the cutoff on never re-includes data the
  // rolling window would otherwise have excluded (or vice versa).
  const windowStart = createdSince && createdSince > rollingWindowStart ? createdSince : rollingWindowStart;
  // Each fragment is separated by an explicit space — concatenating adjacent
  // Prisma.sql fragments with no whitespace between them produces invalid SQL
  // like `$2AND "staff_name"...` when more than one condition is active.
  const staffFragment = scopedStaffSqlFragment(staffName, scope);
  const countryFragment = country ? Prisma.sql` AND "country" = ${country}` : Prisma.empty;
  const qualityFragment = isLeadQuality(leadQuality) ? Prisma.sql` AND "lead_quality" = ${leadQuality}::"CrmLeadQuality"` : Prisma.empty;
  const assignmentFragment = assignmentSqlFragment(assignment);
  const extraCreated = Prisma.sql`${createdBefore ? Prisma.sql` AND "zoho_created_time" < ${createdBefore}` : Prisma.empty}${staffFragment}${countryFragment}${qualityFragment}${assignmentFragment}`;
  const extraConverted = Prisma.sql`${createdSince ? Prisma.sql` AND "zoho_created_time" >= ${createdSince}` : Prisma.empty}${createdBefore ? Prisma.sql` AND "zoho_created_time" < ${createdBefore}` : Prisma.empty}${staffFragment}${countryFragment}${qualityFragment}${assignmentFragment}`;

  const [created, converted] =
    granularity === "day"
      ? await Promise.all([
          prisma.$queryRaw<PeriodCount[]>`SELECT date_trunc('day', "zoho_created_time") AS period, COUNT(*)::bigint AS count FROM crm_leads WHERE "zoho_created_time" >= ${windowStart} ${extraCreated} GROUP BY period`,
          prisma.$queryRaw<PeriodCount[]>`SELECT date_trunc('day', "converted_at") AS period, COUNT(*)::bigint AS count FROM crm_leads WHERE "converted_at" >= ${windowStart} ${extraConverted} GROUP BY period`,
        ])
      : await Promise.all([
          prisma.$queryRaw<PeriodCount[]>`SELECT date_trunc('month', "zoho_created_time") AS period, COUNT(*)::bigint AS count FROM crm_leads WHERE "zoho_created_time" >= ${windowStart} ${extraCreated} GROUP BY period`,
          prisma.$queryRaw<PeriodCount[]>`SELECT date_trunc('month', "converted_at") AS period, COUNT(*)::bigint AS count FROM crm_leads WHERE "converted_at" >= ${windowStart} ${extraConverted} GROUP BY period`,
        ]);

  const createdMap = new Map(created.map((r) => [r.period.toISOString(), Number(r.count)]));
  const convertedMap = new Map(converted.map((r) => [r.period.toISOString(), Number(r.count)]));
  const periods = Array.from(new Set([...createdMap.keys(), ...convertedMap.keys()])).sort();

  return periods.map((p) => {
    const createdCount = createdMap.get(p) ?? 0;
    const convertedCount = convertedMap.get(p) ?? 0;
    return {
      period: p,
      created: createdCount,
      converted: convertedCount,
      // Same-period definition (confirmed with client): converted-in-period /
      // created-in-period — not a cohort of the same leads.
      rate: createdCount > 0 ? Math.round((convertedCount / createdCount) * 1000) / 10 : 0,
    };
  });
}

// -------------------- Widget 4: Stage-wise --------------------

export async function getStageWise(filters: ReportFilters = {}) {
  const dateRange = leadDateRange(filters.createdSince, filters.createdBefore);
  const staffCond = scopedNameFilter(filters.staffName, filters.scope);
  const staffNameWhere = resolveStaffNameWhere(staffCond, filters.assignment);
  const leadWhere: Prisma.CrmLeadWhereInput = {
    ...(dateRange ? { zohoCreatedTime: dateRange } : {}),
    ...(staffNameWhere !== undefined ? { staffName: staffNameWhere } : {}),
    ...leadRefineWhere(filters.country, filters.leadQuality),
  };
  const counts = await prisma.crmLead.groupBy({ by: ["funnelStage"], where: leadWhere, _count: { _all: true } });
  const countFor = (stage: string) => counts.find((c) => c.funnelStage === stage)?._count._all ?? 0;

  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const movements = await prisma.crmLeadStageHistory.groupBy({
    by: ["fromStage", "toStage"],
    where: {
      changedAt: { gte: yesterday },
      ...(Object.keys(leadWhere).length > 0 ? { lead: leadWhere } : {}),
    },
    _count: { _all: true },
  });

  return {
    funnel: FUNNEL_ORDER.map((stage) => ({ stage, count: countFor(stage) })),
    dropped: countFor("DROPPED"),
    other: countFor("OTHER"),
    movementsLast24h: movements.map((m) => ({ fromStage: m.fromStage, toStage: m.toStage, count: m._count._all })),
  };
}

// -------------------- Kanban board (Dashboard + Lead-wise browsing, Staff-wise via staffName) --------------------

const KANBAN_STAGES = [...FUNNEL_ORDER, "DROPPED", "OTHER"];

export async function getKanbanBoard(params: { search?: string } & ReportFilters = {}) {
  const dateRange = leadDateRange(params.createdSince, params.createdBefore);
  const staffCond = scopedNameFilter(params.staffName, params.scope);
  const staffNameWhere = resolveStaffNameWhere(staffCond, params.assignment);
  const where: Prisma.CrmLeadWhereInput = {
    ...(dateRange ? { zohoCreatedTime: dateRange } : {}),
    ...(staffNameWhere !== undefined ? { staffName: staffNameWhere } : {}),
    ...leadRefineWhere(params.country, params.leadQuality),
    ...(params.search
      ? { OR: [{ fullName: { contains: params.search, mode: "insensitive" } }, { company: { contains: params.search, mode: "insensitive" } }] }
      : {}),
  };

  const leads = await prisma.crmLead.findMany({
    where,
    select: { id: true, fullName: true, company: true, staffName: true, funnelStage: true, lastActivityAt: true },
    orderBy: { lastActivityAt: "desc" },
    take: 1000, // safety cap — fine at this org's current scale, revisit if lead volume grows much further
  });

  return KANBAN_STAGES.map((stage) => ({
    stage,
    leads: leads
      .filter((l) => l.funnelStage === stage)
      .map((l) => ({ id: l.id, fullName: l.fullName, company: l.company, staffName: l.staffName, lastActivityAt: l.lastActivityAt })),
  }));
}

// -------------------- Lead-wise report --------------------

export async function listLeadsForSelector(search: string | undefined, filters: ReportFilters = {}) {
  const dateRange = leadDateRange(filters.createdSince, filters.createdBefore);
  const staffCond = scopedNameFilter(filters.staffName, filters.scope);
  const staffNameWhere = resolveStaffNameWhere(staffCond, filters.assignment);
  return prisma.crmLead.findMany({
    where: {
      ...(dateRange ? { zohoCreatedTime: dateRange } : {}),
      ...(staffNameWhere !== undefined ? { staffName: staffNameWhere } : {}),
      ...leadRefineWhere(filters.country, filters.leadQuality),
      ...(search ? { OR: [{ fullName: { contains: search, mode: "insensitive" } }, { company: { contains: search, mode: "insensitive" } }] } : {}),
    },
    select: { id: true, fullName: true, company: true, funnelStage: true, staffName: true, country: true, leadQuality: true },
    orderBy: { fullName: "asc" },
    take: 50,
  });
}

// Every touch on a lead — activities (Notes/Calls/Tasks/Events/Emails) plus
// stage changes and owner reassignments — merged into one chronological
// timeline, oldest first ("start to bottom... according to the time"),
// replacing the separate Stage History / Owner History boxes that used to
// sit next to the activity feed. `activityType` narrows to just that kind
// of activity, which also hides stage/owner-change entries — a type filter
// should mean exactly what it says.
export interface TimelineEntry {
  id: string;
  kind: "ACTIVITY" | "STAGE_CHANGE" | "OWNER_CHANGE";
  activityType: CrmActivityType | null;
  time: Date;
  summary: string | null;
  status: string | null;
  dueDate: Date | null;
  actorName: string | null;
  fromValue: string | null;
  toValue: string | null;
}

export async function getLeadDetail(id: string, activityType?: CrmActivityType, scope?: string[] | null) {
  const lead = await prisma.crmLead.findUnique({
    where: { id },
    include: {
      stageHistory: { orderBy: { changedAt: "asc" } },
      ownerHistory: { orderBy: { changedAt: "asc" } },
      activities: { where: activityType ? { activityType } : undefined, orderBy: { occurredAt: "asc" } },
    },
  });
  if (!lead) throw new AppError(404, "Lead not found");
  // A scoped (Team Lead/Staff) requester can only open a lead staffed to
  // them or their team — same 404 (not 403) as an unknown id, so a scoped
  // user can't probe for the existence of leads outside their visibility.
  if (scope && (!lead.staffName || !scope.includes(lead.staffName))) {
    throw new AppError(404, "Lead not found");
  }

  const timeline: TimelineEntry[] = [
    ...lead.activities.map((a) => ({
      id: a.id,
      kind: "ACTIVITY" as const,
      activityType: a.activityType,
      time: a.occurredAt,
      summary: a.summary,
      status: a.status,
      dueDate: a.dueDate,
      actorName: a.actorName,
      fromValue: null,
      toValue: null,
    })),
    ...(activityType
      ? []
      : lead.stageHistory.map((h) => ({
          id: h.id,
          kind: "STAGE_CHANGE" as const,
          activityType: null,
          time: h.changedAt,
          summary: null,
          status: null,
          dueDate: null,
          actorName: null,
          fromValue: h.fromStage,
          toValue: h.toStage,
        }))),
    ...(activityType
      ? []
      : lead.ownerHistory.map((h) => ({
          id: h.id,
          kind: "OWNER_CHANGE" as const,
          activityType: null,
          time: h.changedAt,
          summary: null,
          status: null,
          dueDate: null,
          actorName: null,
          fromValue: h.fromOwnerName,
          toValue: h.toOwnerName,
        }))),
  ].sort((a, b) => a.time.getTime() - b.time.getTime());

  return {
    id: lead.id,
    fullName: lead.fullName,
    company: lead.company,
    leadSource: lead.leadSource,
    leadStatus: lead.leadStatus,
    funnelStage: lead.funnelStage,
    staffName: lead.staffName,
    ownerName: lead.ownerName,
    country: lead.country,
    leadQuality: lead.leadQuality,
    zohoCreatedTime: lead.zohoCreatedTime,
    converted: lead.converted,
    convertedAt: lead.convertedAt,
    timeline,
  };
}

// Locally-managed classification, not synced from Zoho — set from the
// Lead-wise detail panel by anyone who can already see the lead. Reuses the
// exact same fail-closed scope check as getLeadDetail (same 404, not 403,
// for a lead outside the requester's visibility) rather than inventing a
// separate permission model for writes vs. reads.
export async function setLeadQuality(id: string, quality: string | null, scope?: string[] | null) {
  const lead = await prisma.crmLead.findUnique({ where: { id }, select: { staffName: true } });
  if (!lead) throw new AppError(404, "Lead not found");
  if (scope && (!lead.staffName || !scope.includes(lead.staffName))) {
    throw new AppError(404, "Lead not found");
  }
  if (quality !== null && !isLeadQuality(quality)) {
    throw new AppError(400, `Invalid lead quality "${quality}"`);
  }
  const updated = await prisma.crmLead.update({
    where: { id },
    data: { leadQuality: quality },
    select: { id: true, leadQuality: true },
  });
  return updated;
}

// Distinct, non-null country values across leads the requester can see —
// populates the shared Country filter dropdown, mirroring how `/staff`
// populates the Staff dropdown (see listStaffOverview below).
export async function getDistinctCountries(scope?: string[] | null): Promise<string[]> {
  const rows = await prisma.crmLead.findMany({
    where: { country: { not: null }, ...(scope ? { staffName: { in: scope } } : {}) },
    select: { country: true },
    distinct: ["country"],
    orderBy: { country: "asc" },
  });
  return rows.map((r) => r.country as string);
}

// -------------------- Staff-wise report --------------------
// Keyed by `staffName` — the client's "Staff Name" custom field on the Lead
// (Zoho API name `Staff_Name`), not the standard `Owner` field. Client
// direction: Owner doesn't reliably reflect who's actually working a lead in
// this org, so every staff-level report uses this field instead.

export interface StaffOverviewRow {
  staffName: string;
  leadsOwned: number;
  conversionRate: number;
  activitiesLogged: number;
  lastActivityAt: Date | null;
}

export async function listStaffOverview(filters: ReportFilters = {}): Promise<StaffOverviewRow[]> {
  const dateRange = leadDateRange(filters.createdSince, filters.createdBefore);
  const staffCond = scopedNameFilter(filters.staffName, filters.scope);
  const refine = leadRefineWhere(filters.country, filters.leadQuality);
  // This view is inherently "per staff member" — it defaults to excluding
  // unassigned leads (nothing to group them under) unless the caller
  // explicitly asks for `assignment=unassigned`, in which case it correctly
  // returns no rows (there's no staff to report on).
  const staffNameWhere =
    filters.assignment !== undefined ? resolveStaffNameWhere(staffCond, filters.assignment) : (staffCond ?? { not: null });
  const leads = await prisma.crmLead.findMany({
    where: {
      staffName: staffNameWhere,
      ...(dateRange ? { zohoCreatedTime: dateRange } : {}),
      ...refine,
    },
    select: { staffName: true, converted: true },
  });

  const byStaff = new Map<string, { total: number; converted: number }>();
  for (const l of leads) {
    if (!l.staffName) continue;
    const entry = byStaff.get(l.staffName) ?? { total: 0, converted: 0 };
    entry.total++;
    if (l.converted) entry.converted++;
    byStaff.set(l.staffName, entry);
  }

  const activityLeadFilter: Prisma.CrmLeadWhereInput = { ...(dateRange ? { zohoCreatedTime: dateRange } : {}), ...refine };
  const activityAgg = await prisma.crmLeadActivity.groupBy({
    by: ["actorName"],
    where: {
      actorName: staffCond !== undefined ? staffCond : { not: null },
      ...(Object.keys(activityLeadFilter).length > 0 ? { lead: activityLeadFilter } : {}),
    },
    _count: { _all: true },
    _max: { occurredAt: true },
  });
  const activityByName = new Map(activityAgg.map((a) => [a.actorName as string, { count: a._count._all, lastActivityAt: a._max.occurredAt }]));

  // Union of names seen as either a lead's staffName or an activity actor —
  // a staff member who's logged activity but currently has no leads staffed
  // to them (or vice versa) should still show up. Both queries above already
  // apply the caller's scope, so this union is scoped too.
  const allNames = new Set<string>([...byStaff.keys(), ...activityByName.keys()]);

  return Array.from(allNames)
    .map((staffName) => {
      const owned = byStaff.get(staffName);
      const act = activityByName.get(staffName);
      return {
        staffName,
        leadsOwned: owned?.total ?? 0,
        conversionRate: owned && owned.total > 0 ? Math.round((owned.converted / owned.total) * 1000) / 10 : 0,
        activitiesLogged: act?.count ?? 0,
        lastActivityAt: act?.lastActivityAt ?? null,
      };
    })
    .sort((a, b) => a.staffName.localeCompare(b.staffName));
}

export async function getStaffDetail(staffName: string, filters: ReportFilters = {}) {
  // Same fail-closed 404 as getLeadDetail — a scoped requester asking for a
  // staffName outside their team shouldn't learn whether that name exists.
  if (filters.scope && !filters.scope.includes(staffName)) {
    throw new AppError(404, "No leads or activity found for this staff member");
  }

  const dateRange = leadDateRange(filters.createdSince, filters.createdBefore);
  const leadWhere: Prisma.CrmLeadWhereInput = {
    staffName,
    ...(dateRange ? { zohoCreatedTime: dateRange } : {}),
    ...leadRefineWhere(filters.country, filters.leadQuality),
  };
  const [leads, activitiesLogged] = await Promise.all([
    prisma.crmLead.findMany({
      where: leadWhere,
      orderBy: { zohoCreatedTime: "desc" },
      include: {
        // Latest activity on the lead itself (by anyone, same convention as
        // the Dashboard's Assignment Overview widget) — folded into this one
        // table instead of a second "activity feed" panel next to it.
        activities: { orderBy: { occurredAt: "desc" }, take: 1 },
      },
    }),
    prisma.crmLeadActivity.count({
      where: { actorName: staffName, ...(dateRange ? { lead: { zohoCreatedTime: dateRange } } : {}) },
    }),
  ]);

  if (leads.length === 0 && activitiesLogged === 0) {
    // Empty because the date filter excluded everything is a normal state
    // (the frontend renders it as an empty table), not a 404 — only a truly
    // unknown name (no leads/activity for them at all, filter or no filter) is.
    const everAssigned = await prisma.crmLead.findFirst({ where: { staffName } });
    if (!everAssigned) {
      const everActive = await prisma.crmLeadActivity.findFirst({ where: { actorName: staffName } });
      if (!everActive) throw new AppError(404, "No leads or activity found for this staff member");
    }
  }

  const convertedOwned = leads.filter((l) => l.converted).length;

  return {
    staffName,
    leads: leads.map((l) => ({
      id: l.id,
      fullName: l.fullName,
      company: l.company,
      funnelStage: l.funnelStage,
      converted: l.converted,
      // Zoho tracks no change history for the Staff Name field (unlike
      // Owner), so there's no equivalent of "date staffed to them" — lead
      // creation date is the closest available signal.
      assignedAt: l.zohoCreatedTime,
      lastActivity: l.activities[0]
        ? { type: l.activities[0].activityType, summary: l.activities[0].summary, occurredAt: l.activities[0].occurredAt }
        : null,
    })),
    stats: {
      leadsOwned: leads.length,
      activitiesLogged,
      // All-time, not the same-period window used by the landing-page widget
      // — "their" conversion rate reads more naturally as a lifetime number.
      conversionRate: leads.length > 0 ? Math.round((convertedOwned / leads.length) * 1000) / 10 : 0,
    },
  };
}

// -------------------- Nepal-time period bounds (Daily Report + Closure Report) --------------------
// "Today"/"yesterday"/"this week"/"this month" are anchored to Nepal local
// time (Asia/Kathmandu, UTC+5:45) regardless of the server's own timezone,
// since that's where the team actually is.
const KATHMANDU_OFFSET_MS = (5 * 60 + 45) * 60 * 1000;

// `anchorDate`, when given, is treated as the calendar date itself (e.g. a
// plain "2026-09-10" parses to that date's UTC midnight) rather than a live
// timestamp needing the +offset-then-truncate conversion — it's already
// "which Nepal calendar day," not "what does the clock read right now."
function kathmanduDayBounds(daysAgo: number, anchorDate?: Date): { start: Date; end: Date } {
  const shifted = anchorDate
    ? new Date(Date.UTC(anchorDate.getUTCFullYear(), anchorDate.getUTCMonth(), anchorDate.getUTCDate()))
    : new Date(Date.now() + KATHMANDU_OFFSET_MS);
  shifted.setUTCHours(0, 0, 0, 0);
  shifted.setUTCDate(shifted.getUTCDate() - daysAgo);
  const start = new Date(shifted.getTime() - KATHMANDU_OFFSET_MS);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}

export type ClosurePeriod = "day" | "week" | "month";

function kathmanduPeriodBounds(period: ClosurePeriod): { start: Date; end: Date } {
  const shifted = new Date(Date.now() + KATHMANDU_OFFSET_MS);
  shifted.setUTCHours(0, 0, 0, 0);
  if (period === "week") {
    const dow = shifted.getUTCDay(); // 0=Sun..6=Sat
    shifted.setUTCDate(shifted.getUTCDate() - (dow === 0 ? 6 : dow - 1)); // back to Monday
  } else if (period === "month") {
    shifted.setUTCDate(1);
  }
  const start = new Date(shifted.getTime() - KATHMANDU_OFFSET_MS);
  let end: Date;
  if (period === "day") end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  else if (period === "week") end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);
  else {
    const endShifted = new Date(shifted);
    endShifted.setUTCMonth(endShifted.getUTCMonth() + 1);
    end = new Date(endShifted.getTime() - KATHMANDU_OFFSET_MS);
  }
  return { start, end };
}

// -------------------- Daily Report (everyday morning-meeting sheet) --------------------
// Client-confirmed scope: CRM Leads/Calls only (not the internal Task app).
// Deliberately ignores the leads-since date filter used everywhere else —
// this report is about what's happening in the selected range, regardless
// of how old the underlying lead is, so excluding older leads could hide
// real ongoing work. `fromDate`/`toDate` (both optional, defaulting to
// actual yesterday/today) define a genuine inclusive date RANGE — every
// section below covers the *entire* range, not just its two endpoints.
//
// Every item type here is credited to the parent Lead's `staffName`, not the
// activity's own `actorName` — confirmed against this org's real Zoho data
// that both Tasks' and Calls' Owner field is a single generic account
// (Harsh Singhania for Tasks, Sanjay Singhania for Calls) regardless of who
// actually works the lead, so `actorName` is useless for attribution here.
// This is a deliberate, Daily-Report-specific exception to the general
// actorName-based convention used by Activity Feed elsewhere in this module
// (where actorName is still the right answer for "who logged this note").

interface DailyReportItem {
  activityId: string;
  leadId: string;
  leadName: string;
  company: string | null;
  staff: string | null;
  subject: string | null;
  status: string | null;
  scheduledAt: Date | null;
  time: Date;
  latestNote: string | null;
}

// Two related counts per staff in one row — e.g. completed-vs-due, or
// completed-vs-missed — so the frontend can render a single grouped bar
// chart (a real side-by-side comparison) instead of two separate pies that
// can't be compared against each other at a glance.
function combineByStaff(itemsA: DailyReportItem[], itemsB: DailyReportItem[]): { staff: string; a: number; b: number }[] {
  const counts = new Map<string, { a: number; b: number }>();
  for (const item of itemsA) {
    const key = item.staff ?? "Unassigned";
    const entry = counts.get(key) ?? { a: 0, b: 0 };
    entry.a++;
    counts.set(key, entry);
  }
  for (const item of itemsB) {
    const key = item.staff ?? "Unassigned";
    const entry = counts.get(key) ?? { a: 0, b: 0 };
    entry.b++;
    counts.set(key, entry);
  }
  return Array.from(counts.entries())
    .map(([staff, { a, b }]) => ({ staff, a, b }))
    .sort((x, y) => y.a + y.b - (x.a + x.b));
}

type DailyActivityRow = {
  id: string;
  leadId: string;
  actorName: string | null;
  summary: string | null;
  status: string | null;
  dueDate: Date | null;
  occurredAt: Date;
  lead: { fullName: string | null; company: string | null; staffName: string | null };
};

function toDailyItems(activities: DailyActivityRow[], notesByLead: Map<string, string>): DailyReportItem[] {
  return activities.map((a) => ({
    activityId: a.id,
    leadId: a.leadId,
    leadName: a.lead.fullName ?? a.lead.company ?? "(unnamed lead)",
    company: a.lead.company,
    staff: a.lead.staffName,
    subject: a.summary,
    status: a.status,
    scheduledAt: a.dueDate,
    time: a.occurredAt,
    latestNote: notesByLead.get(a.leadId) ?? null,
  }));
}

// Every Note-type activity's own `summary` is already truncated to 200 chars
// at sync time (crmLeads.service.ts) — "what does the note say" here is
// deliberately just the single most recent note per lead, not a full note
// history, to keep each Daily Report row a one-line glance.
async function latestNotesForLeads(leadIds: string[]): Promise<Map<string, string>> {
  if (leadIds.length === 0) return new Map();
  const notes = await prisma.crmLeadActivity.findMany({
    where: { activityType: "NOTE", leadId: { in: leadIds } },
    select: { leadId: true, summary: true, occurredAt: true },
    orderBy: { occurredAt: "desc" },
  });
  const byLead = new Map<string, string>();
  for (const n of notes) {
    if (!byLead.has(n.leadId) && n.summary) byLead.set(n.leadId, n.summary);
  }
  return byLead;
}

// Mirrors latestNotesForLeads above but for the lead's most recent CALL
// activity — lets the Leads table show "how did the last call with this
// lead go" (Completed/Scheduled/etc.) and, separately, *when* it actually
// happened (only meaningful once a call has actually gone through — a
// merely-scheduled call has no "done at" time), inline without opening the
// lead. No call activity at all (leadId absent from the map) reads as
// "Not Started" on the frontend.
async function latestCallInfoForLeads(leadIds: string[]): Promise<Map<string, { status: string; completedAt: Date | null }>> {
  if (leadIds.length === 0) return new Map();
  const calls = await prisma.crmLeadActivity.findMany({
    where: { activityType: "CALL", leadId: { in: leadIds } },
    select: { leadId: true, status: true, occurredAt: true },
    orderBy: { occurredAt: "desc" },
  });
  const byLead = new Map<string, { status: string; completedAt: Date | null }>();
  for (const c of calls) {
    if (!c.status) continue;
    const entry = byLead.get(c.leadId);
    if (!entry) byLead.set(c.leadId, { status: c.status, completedAt: c.status === "Completed" ? c.occurredAt : null });
    else if (entry.completedAt === null && c.status === "Completed") entry.completedAt = c.occurredAt;
  }
  return byLead;
}

export interface NextFollowUp {
  dueDate: Date;
  status: string | null;
  type: "TASK" | "CALL" | "EVENT";
}

// "What's the next thing scheduled for this lead" — not just the next open
// Task, since the actual follow-up chain in this org moves between types
// (an initial Task gets worked, then someone schedules a Call or a meeting,
// which supersedes it). Takes the single most recently-scheduled item
// across TASK/CALL/EVENT (by dueDate — Due_Date / Call_Start_Time /
// Start_DateTime respectively), whichever type it is, and surfaces its own
// completion status alongside the date rather than filtering to
// not-yet-completed only — so the column keeps showing the current
// follow-up (and that it's done) until a newer one is scheduled, instead of
// going blank the moment it's completed.
async function nextFollowUpForLeads(leadIds: string[]): Promise<Map<string, NextFollowUp>> {
  if (leadIds.length === 0) return new Map();
  const items = await prisma.crmLeadActivity.findMany({
    where: { activityType: { in: ["TASK", "CALL", "EVENT"] }, leadId: { in: leadIds }, dueDate: { not: null } },
    select: { leadId: true, dueDate: true, status: true, activityType: true },
    orderBy: { dueDate: "desc" },
  });
  const byLead = new Map<string, NextFollowUp>();
  for (const it of items) {
    if (!byLead.has(it.leadId) && it.dueDate) {
      byLead.set(it.leadId, { dueDate: it.dueDate, status: it.status, type: it.activityType as "TASK" | "CALL" | "EVENT" });
    }
  }
  return byLead;
}

export interface LeadsAssignedRow {
  staff: string;
  count: number;
}

export interface DailyLeadItem {
  leadId: string;
  leadName: string;
  company: string | null;
  staff: string | null;
  status: string | null;
  country: string | null;
  leadQuality: CrmLeadQuality | null;
  phone: string | null;
  createdAt: Date;
  latestNote: string | null;
  callStatus: string | null;
  callAt: Date | null;
  nextFollowUpAt: Date | null;
  nextFollowUpType: string | null;
  nextFollowUpStatus: string | null;
}

export interface TaskStaffComparisonRow {
  staff: string;
  completed: number;
  due: number;
}

export interface CallStaffComparisonRow {
  staff: string;
  completed: number;
  missed: number;
}

export async function getDailyReport(
  staffName?: string,
  scope?: string[] | null,
  fromDate?: Date,
  toDate?: Date,
  country?: string,
  leadQuality?: string,
  assignment?: string,
) {
  // `from`/`to` each resolve to a full Nepal-local day, then the range spans
  // from the start of `from`'s day to the END of `to`'s day (inclusive of
  // the whole `to` day) — defaults to actual yesterday..today when omitted.
  const from = kathmanduDayBounds(fromDate ? 0 : 1, fromDate);
  const to = kathmanduDayBounds(0, toDate);
  const range = { gte: from.start, lt: to.end };
  const leadSelect = { select: { fullName: true, company: true, staffName: true } } as const;
  const nameCond = scopedNameFilter(staffName, scope);
  const staffNameWhere = resolveStaffNameWhere(nameCond, assignment);
  const refine = leadRefineWhere(country, leadQuality);
  const leadStaffFilter =
    staffNameWhere !== undefined || Object.keys(refine).length > 0
      ? { lead: { ...(staffNameWhere !== undefined ? { staffName: staffNameWhere } : {}), ...refine } }
      : {};

  const [completedRaw, dueRaw, callsRaw, leadsAssignedRaw, leadsListRaw] = await Promise.all([
    // Tasks whose status turned Completed, last touched anywhere in the
    // range (Modified_Time is what occurredAt is set from for TASK
    // activities). Credited to the lead's Staff Name — see module comment above.
    prisma.crmLeadActivity.findMany({
      where: { activityType: "TASK", status: "Completed", occurredAt: range, ...leadStaffFilter },
      orderBy: { occurredAt: "desc" },
      include: { lead: leadSelect },
    }),
    // Open tasks (not Completed) due anywhere in the range. Credited to the lead's Staff Name.
    prisma.crmLeadActivity.findMany({
      where: { activityType: "TASK", status: { not: "Completed" }, dueDate: range, ...leadStaffFilter },
      orderBy: { dueDate: "asc" },
      include: { lead: leadSelect },
    }),
    // Every call scheduled anywhere in the range (dueDate = Call_Start_Time),
    // regardless of whether it's already happened — `status` tells you
    // whether it actually got made ("Completed", i.e. moved to
    // Calls_History) or is/was missed (still "Scheduled"). Credited to the
    // lead's Staff Name.
    prisma.crmLeadActivity.findMany({
      where: { activityType: "CALL", dueDate: range, ...leadStaffFilter },
      orderBy: { dueDate: "asc" },
      include: { lead: leadSelect },
    }),
    // Leads created within the selected range, grouped by the staff they're
    // currently assigned to. Zoho tracks no change history for Staff Name
    // itself, so this can't mean "who it was assigned to back then" — it
    // means "of the leads that came in during this window, who holds them
    // now," scoped by `zohoCreatedTime` the same way every other
    // creation-date filter in this module works. `nameCond` is only
    // `staffNameWhere` is `undefined` when there's no staff filter, no
    // role-scope restriction, AND no assignment filter — in that one case,
    // unlike every other query in this module, we deliberately do NOT force
    // `staffName: { not: null }`, so unassigned leads count toward the
    // total too. Choosing a specific staff, a scoped role, or an explicit
    // `assignment=assigned/unassigned` all resolve `staffNameWhere` to
    // something defined, which naturally narrows appropriately.
    prisma.crmLead.groupBy({
      by: ["staffName"],
      where: { ...(staffNameWhere !== undefined ? { staffName: staffNameWhere } : {}), zohoCreatedTime: range, ...refine },
      _count: { _all: true },
    }),
    // Same set of leads as leadsAssignedRaw, but row-by-row — a "Leads"
    // table alongside Tasks/Calls, not just the per-staff count widget.
    prisma.crmLead.findMany({
      where: { ...(staffNameWhere !== undefined ? { staffName: staffNameWhere } : {}), zohoCreatedTime: range, ...refine },
      select: { id: true, fullName: true, company: true, staffName: true, leadStatus: true, phone: true, country: true, leadQuality: true, zohoCreatedTime: true },
      orderBy: { zohoCreatedTime: "desc" },
    }),
  ]);

  const allLeadIds = Array.from(new Set([...completedRaw, ...dueRaw, ...callsRaw, ...leadsListRaw.map((l) => ({ leadId: l.id }))].map((a) => a.leadId)));
  const notesByLead = await latestNotesForLeads(allLeadIds);
  const leadOnlyIds = leadsListRaw.map((l) => l.id);
  const callInfoByLead = await latestCallInfoForLeads(leadOnlyIds);
  const nextFollowUpByLead = await nextFollowUpForLeads(leadOnlyIds);

  const completed = toDailyItems(completedRaw, notesByLead);
  const due = toDailyItems(dueRaw, notesByLead);
  const calls = toDailyItems(callsRaw, notesByLead);
  const callsCompleted = calls.filter((c) => c.status === "Completed");
  const callsMissed = calls.filter((c) => c.status !== "Completed");

  const leadsAssigned: LeadsAssignedRow[] = leadsAssignedRaw
    .filter((r) => r.staffName)
    .map((r) => ({ staff: r.staffName as string, count: r._count._all }))
    .sort((a, b) => b.count - a.count);

  // Assigned-vs-unassigned split for the Leads overview card — same
  // classification the Tasks/Calls cards already show (completed-vs-due,
  // completed-vs-missed), just for staffing instead of status.
  const leadsAssignedCount = leadsListRaw.filter((l) => l.staffName !== null).length;
  const leadsUnassignedCount = leadsListRaw.length - leadsAssignedCount;

  const leads: DailyLeadItem[] = leadsListRaw.map((l) => ({
    leadId: l.id,
    leadName: l.fullName ?? l.company ?? "(unnamed lead)",
    company: l.company,
    staff: l.staffName,
    status: l.leadStatus,
    country: l.country,
    leadQuality: l.leadQuality,
    phone: l.phone,
    latestNote: notesByLead.get(l.id) ?? null,
    callStatus: callInfoByLead.get(l.id)?.status ?? null,
    callAt: callInfoByLead.get(l.id)?.completedAt ?? null,
    nextFollowUpAt: nextFollowUpByLead.get(l.id)?.dueDate ?? null,
    nextFollowUpType: nextFollowUpByLead.get(l.id)?.type ?? null,
    nextFollowUpStatus: nextFollowUpByLead.get(l.id)?.status ?? null,
    createdAt: l.zohoCreatedTime as Date,
  }));

  const taskComparison: TaskStaffComparisonRow[] = combineByStaff(completed, due).map((r) => ({
    staff: r.staff,
    completed: r.a,
    due: r.b,
  }));
  const callComparison: CallStaffComparisonRow[] = combineByStaff(callsCompleted, callsMissed).map((r) => ({
    staff: r.staff,
    completed: r.a,
    missed: r.b,
  }));

  return {
    fromDate: from.start.toISOString(),
    toDate: to.start.toISOString(),
    leadsAssigned,
    taskComparison,
    callComparison,
    leads: { total: leads.length, assigned: leadsAssignedCount, unassigned: leadsUnassignedCount, items: leads },
    completed: { total: completed.length, items: completed },
    due: { total: due.length, items: due },
    calls: { total: calls.length, missed: callsMissed.length, items: calls },
  };
}

// -------------------- Closure Report (day/week/month per-staff board) --------------------
// "Closure report" per the client: how many tasks/activities each person
// closed, and how many leads they turned into deals, over a day/week/month.
// "Deals converted" specifically means a Lead whose Zoho conversion created
// a Deal record (`convertedDealId` set) — not just the generic `converted`
// flag, which Zoho also sets for a Lead converted to an Account/Contact
// with no Deal at all (see the query below for the real counts this
// distinction makes). Every item type here — completed TASKs, completed
// CALLs, and converted deals — is credited to the parent Lead's
// `staffName`, not `actorName`: confirmed against this org's real Zoho data
// that both Tasks' and Calls' Owner field is a single generic account
// (Harsh Singhania / Sanjay Singhania respectively) regardless of who
// actually works the lead, so `actorName` is useless for attribution here —
// same finding as the Daily Report above.

export interface ClosureReportRow {
  staff: string;
  activitiesClosed: number;
  dealsConverted: number;
}

export async function getClosureReport(
  period: ClosurePeriod,
  staffName?: string,
  scope?: string[] | null,
  country?: string,
  leadQuality?: string,
  assignment?: string,
) {
  const { start, end } = kathmanduPeriodBounds(period);
  const nameCond = scopedNameFilter(staffName, scope);
  // Same "per staff" default as listStaffOverview: excludes unassigned
  // unless `assignment=unassigned` is explicitly requested (in which case
  // there's correctly nothing to report — no staff to credit it to).
  const staffNameWhere = assignment !== undefined ? resolveStaffNameWhere(nameCond, assignment) : (nameCond ?? { not: null });
  const leadStaffWhere: Prisma.CrmLeadWhereInput = {
    staffName: staffNameWhere,
    ...leadRefineWhere(country, leadQuality),
  };

  const [completedTasks, completedCalls, dealAgg] = await Promise.all([
    // Grouped in JS, not via Prisma groupBy, since crediting by the PARENT
    // lead's staffName (a relation field) isn't expressible as a groupBy `by`.
    prisma.crmLeadActivity.findMany({
      where: { status: "Completed", activityType: "TASK", occurredAt: { gte: start, lt: end }, lead: leadStaffWhere },
      select: { lead: { select: { staffName: true } } },
    }),
    prisma.crmLeadActivity.findMany({
      where: { status: "Completed", activityType: "CALL", occurredAt: { gte: start, lt: end }, lead: leadStaffWhere },
      select: { lead: { select: { staffName: true } } },
    }),
    // "Deals converted" means literally that — a Lead whose Zoho conversion
    // created a Deal record — not just any conversion. Zoho's conversion
    // wizard lets a Lead convert to an Account/Contact with NO Deal (the
    // `converted` flag alone doesn't distinguish this): confirmed against
    // real data that 91 leads in this org are `converted: true` but only 23
    // actually have a `convertedDealId`. Counting the generic flag would
    // overstate deals closed by ~4x.
    prisma.crmLead.groupBy({
      by: ["staffName"],
      where: {
        convertedDealId: { not: null },
        convertedAt: { gte: start, lt: end },
        ...leadStaffWhere,
      },
      _count: { _all: true },
    }),
  ]);

  const byStaff = new Map<string, ClosureReportRow>();
  function bump(name: string | null, field: "activitiesClosed" | "dealsConverted", amount = 1) {
    if (!name) return;
    const row = byStaff.get(name) ?? { staff: name, activitiesClosed: 0, dealsConverted: 0 };
    row[field] += amount;
    byStaff.set(name, row);
  }
  for (const t of completedTasks) bump(t.lead.staffName, "activitiesClosed");
  for (const c of completedCalls) bump(c.lead.staffName, "activitiesClosed");
  for (const d of dealAgg) bump(d.staffName, "dealsConverted", d._count._all);

  const rows = Array.from(byStaff.values()).sort((a, b) => b.activitiesClosed + b.dealsConverted - (a.activitiesClosed + a.dealsConverted));

  return {
    period,
    start: start.toISOString(),
    end: end.toISOString(),
    totals: { activitiesClosed: rows.reduce((s, r) => s + r.activitiesClosed, 0), dealsConverted: rows.reduce((s, r) => s + r.dealsConverted, 0) },
    rows,
  };
}
