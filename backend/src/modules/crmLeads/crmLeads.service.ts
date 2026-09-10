import { CrmActivityType, ZohoSyncStatus } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { getEffectiveSettings } from "../../modules/config/config.service";
import { getAccessToken } from "../zoho/zoho.service";
import { computeFunnelStage } from "./funnelStage";

// ---------------------------------------------------------------------------
// Leads + Reports spec, Section 2/3/4: extends the existing Zoho Tasks sync
// (modules/zoho) to also pull the Leads module plus its Notes/Calls/Events/
// Tasks/Emails related lists. Reuses that module's OAuth token cache
// (getAccessToken) rather than refreshing a second, independent token.
//
// Field names below (Section 2.1/2.3) were confirmed live against this org's
// Zoho CRM via the API — not guessed — except where a comment says otherwise.
// ---------------------------------------------------------------------------

const MODULE_NAME = "Leads";

interface ZohoLookup {
  id?: string;
  name?: string;
  full_name?: string;
  email?: string;
}

interface ZohoLead {
  id: string;
  Owner?: ZohoLookup;
  Full_Name?: string;
  First_Name?: string;
  Last_Name?: string;
  Company?: string;
  Email?: string;
  Phone?: string;
  Lead_Source?: string;
  Lead_Status?: string;
  Created_Time?: string;
  Modified_Time?: string;
  Converted__s?: boolean;
  Converted_Date_Time?: string;
  Converted_Account?: ZohoLookup | null;
  Converted_Contact?: ZohoLookup | null;
  Converted_Deal?: ZohoLookup | null;
  Description?: string;
  Tag?: Array<{ name?: string } | string> | null;
  // Custom picklist field the client added directly in Zoho (Setup >
  // Customization > Modules > Leads > Fields, API name `Staff_Name`) — the
  // actual "who's working this lead" field, distinct from Owner. Its
  // picklist includes a literal "-None-" option alongside real staff names.
  Staff_Name?: string;
  [key: string]: unknown;
}

const ZOHO_LEAD_FIELDS = [
  "id",
  "Owner",
  "Full_Name",
  "First_Name",
  "Last_Name",
  "Company",
  "Email",
  "Phone",
  "Lead_Source",
  "Lead_Status",
  "Created_Time",
  "Modified_Time",
  "Converted__s",
  "Converted_Date_Time",
  "Converted_Account",
  "Converted_Contact",
  "Converted_Deal",
  "Description",
  "Tag",
  "Staff_Name",
].join(",");

async function authHeaders(): Promise<Record<string, string>> {
  const token = await getAccessToken();
  return { Authorization: `Zoho-oauthtoken ${token}` };
}

// Section 4.1/4.2: incremental fetches pass `sinceModifiedTime` (via Zoho's
// documented If-Modified-Since header on GET); a full backfill omits it and
// walks every page, `converted=both` so converted leads aren't skipped
// (needed for the conversion-rate report). Section 4.1 also calls for
// `page_token`-based pagination beyond 2000 records — used here once Zoho
// starts returning one in `info.next_page_token`.
async function fetchZohoLeads(sinceModifiedTime?: Date): Promise<ZohoLead[]> {
  const { zohoApiBaseUrl } = await getEffectiveSettings();
  const headers = await authHeaders();
  if (sinceModifiedTime) headers["If-Modified-Since"] = sinceModifiedTime.toISOString();

  const all: ZohoLead[] = [];
  let page = 1;
  let pageToken: string | undefined;
  while (true) {
    const qs = new URLSearchParams({
      per_page: "200",
      fields: ZOHO_LEAD_FIELDS,
      converted: "both",
      sort_by: "Modified_Time",
      sort_order: "asc",
    });
    if (pageToken) qs.set("page_token", pageToken);
    else qs.set("page", String(page));

    const res = await fetch(`${zohoApiBaseUrl}/crm/v6/Leads?${qs.toString()}`, { headers });
    if (res.status === 204 || res.status === 304) break; // no (more) records / nothing modified
    if (!res.ok) throw new Error(`Zoho Leads fetch failed: ${res.status} ${await res.text()}`);
    const body = (await res.json()) as { data?: ZohoLead[]; info?: { more_records?: boolean; next_page_token?: string } };
    all.push(...(body.data ?? []));
    if (!body.info?.more_records) break;
    if (body.info?.next_page_token) pageToken = body.info.next_page_token;
    else page++;
  }
  return all;
}

// ---------------------------------------------------------------------------
// Section 2.3: unified activity feed (Notes, Calls, Events, Tasks, Emails).
// `Activities_Chronological_View` (the grouped list Zoho's own UI uses) has
// no `href` in Get Related Lists for this org — it's a UI-only grouping, not
// API-readable — so this fetches the five related lists individually and
// merges them, per the spec's documented fallback.
// ---------------------------------------------------------------------------

interface RawActivityRecord {
  [key: string]: unknown;
}

interface ActivitySpec {
  type: CrmActivityType;
  relatedLists: string[]; // e.g. ["Calls", "Calls_History"]
  fields: string;
  // Every related list keys its records under `data` in the response body
  // except Emails, which nests them under its own name instead (confirmed
  // live: `Leads/{id}/Emails` returns `{"Emails": [...]}`, no `data` key at
  // all) — see fetchRelatedList.
  getId?: (r: RawActivityRecord) => string | undefined; // defaults to r.id
  // `relatedList` lets a spec tell open ("Tasks"/"Calls") from closed
  // ("Tasks_History"/"Calls_History") apart — used as a status fallback
  // for Calls, which have no clean status field of their own (Section
  // Daily Report: "completed yesterday" / "due today" / "calls today").
  normalize: (r: RawActivityRecord, relatedList: string) => { occurredAt: Date; actorId?: string; actorName?: string; summary?: string; dueDate?: Date; status?: string };
}

function lookupName(v: unknown): { id?: string; name?: string } {
  if (v && typeof v === "object") {
    const o = v as ZohoLookup;
    return { id: o.id, name: o.name ?? o.full_name };
  }
  return {};
}

function firstDate(...values: unknown[]): Date {
  for (const v of values) {
    if (typeof v === "string" && v) {
      const d = new Date(v);
      if (!Number.isNaN(d.getTime())) return d;
    }
  }
  return new Date();
}

const ACTIVITY_SPECS: ActivitySpec[] = [
  {
    type: "NOTE",
    relatedLists: ["Notes"],
    fields: "id,Note_Title,Note_Content,Owner,Created_By,Created_Time,Modified_Time",
    normalize: (r) => {
      const actor = lookupName(r.Owner ?? r.Created_By);
      const content = typeof r.Note_Content === "string" ? r.Note_Content.slice(0, 200) : undefined;
      return {
        occurredAt: firstDate(r.Modified_Time, r.Created_Time),
        actorId: actor.id,
        actorName: actor.name,
        summary: (r.Note_Title as string) || content,
      };
    },
  },
  {
    type: "CALL",
    // Closed calls live in the separate "Calls_History" related list (Section 2.3).
    relatedLists: ["Calls", "Calls_History"],
    fields: "id,Subject,Call_Type,Call_Purpose,Call_Start_Time,Description,Call_Result,Owner,Created_Time,Modified_Time",
    normalize: (r, relatedList) => {
      const actor = lookupName(r.Owner);
      const type = (r.Call_Type as string) || "Call";
      return {
        occurredAt: firstDate(r.Call_Start_Time, r.Created_Time),
        actorId: actor.id,
        actorName: actor.name,
        summary: (r.Subject as string) || type,
        // Zoho's Calls related list has no clean "status" field of its own —
        // which list it came from is the status: still-open calls live in
        // "Calls", closed ones move to "Calls_History".
        status: relatedList === "Calls_History" ? "Completed" : "Scheduled",
      };
    },
  },
  {
    type: "EVENT",
    relatedLists: ["Events", "Events_History"],
    fields: "id,Event_Title,Venue,Start_DateTime,End_DateTime,Description,Owner,Created_Time,Modified_Time",
    normalize: (r) => {
      const actor = lookupName(r.Owner);
      return {
        occurredAt: firstDate(r.Start_DateTime, r.Created_Time),
        actorId: actor.id,
        actorName: actor.name,
        summary: r.Event_Title as string,
      };
    },
  },
  {
    type: "TASK",
    relatedLists: ["Tasks", "Tasks_History"],
    fields: "id,Subject,Due_Date,Status,Owner,Created_Time,Modified_Time",
    normalize: (r, relatedList) => {
      const actor = lookupName(r.Owner);
      const dueDateStr = r.Due_Date as string | undefined;
      return {
        occurredAt: firstDate(r.Modified_Time, r.Due_Date, r.Created_Time),
        actorId: actor.id,
        actorName: actor.name,
        summary: r.Subject as string,
        dueDate: dueDateStr ? new Date(dueDateStr) : undefined,
        status: (r.Status as string) || (relatedList === "Tasks_History" ? "Completed" : undefined),
      };
    },
  },
  {
    type: "EMAIL",
    // Confirmed live against a real org: the Emails related list is a
    // completely different shape from the other four — it ignores the
    // `fields` param entirely and always returns its own fixed field set
    // (lowercase `subject`/`from`/`to`/`time`/`status`, no `Sent_On` or
    // `Sender` at all), and its records have no `id` — `message_id` is the
    // closest thing to a stable identifier, so that's what dedup keys off.
    relatedLists: ["Emails"],
    fields: "",
    getId: (r) => r.message_id as string | undefined,
    normalize: (r) => {
      const from = r.from as { user_name?: string; email?: string } | undefined;
      const to = Array.isArray(r.to) ? (r.to as Array<{ email?: string }>).map((t) => t.email).filter(Boolean) : [];
      return {
        occurredAt: firstDate(r.time),
        actorName: from?.user_name || from?.email,
        summary: [r.subject as string | undefined, to.length ? `to ${to.join(", ")}` : undefined].filter(Boolean).join(" — "),
      };
    },
  },
];

let emailsRelatedListWarned = false;

async function fetchRelatedList(leadZohoId: string, relatedList: string, fields: string): Promise<RawActivityRecord[]> {
  const { zohoApiBaseUrl } = await getEffectiveSettings();
  const headers = await authHeaders();
  const all: RawActivityRecord[] = [];
  let page = 1;
  while (true) {
    const qs = new URLSearchParams({ per_page: "200", page: String(page), ...(fields ? { fields } : {}) });
    const res = await fetch(`${zohoApiBaseUrl}/crm/v6/Leads/${leadZohoId}/${relatedList}?${qs.toString()}`, { headers });
    if (res.status === 204) break;
    if (!res.ok) {
      // Kept as a safety net for orgs/editions where this related list
      // genuinely isn't available (unlike here, where it turned out to
      // just have a different response shape — see below).
      if (relatedList === "Emails") {
        if (!emailsRelatedListWarned) {
          emailsRelatedListWarned = true;
          console.warn(`[crmLeadsSync] Leads/{id}/Emails not available on this org/edition (${res.status}) — Email activities will be absent from the feed.`);
        }
        return [];
      }
      throw new Error(`Zoho ${relatedList} fetch failed for lead ${leadZohoId}: ${res.status} ${await res.text()}`);
    }
    const body = (await res.json()) as { data?: RawActivityRecord[]; info?: { more_records?: boolean }; [key: string]: unknown };
    // Notes/Calls/Events/Tasks key their records under `data`; Emails keys
    // them under its own related-list name instead (confirmed live) — fall
    // back to that before giving up.
    const records = Array.isArray(body.data) ? body.data : Array.isArray(body[relatedList]) ? (body[relatedList] as RawActivityRecord[]) : [];
    all.push(...records);
    if (!body.info?.more_records) break; // Emails has no `info`/pagination at all — always a single page
    page++;
  }
  return all;
}

// Sequential by design (Section 4.1: "don't fire hundreds of related-list
// calls concurrently") — this already runs inside a per-lead sequential loop
// in runCrmLeadsSync, so nesting concurrency here would multiply the burst.
interface NormalizedActivity {
  type: CrmActivityType;
  zohoActivityId: string;
  occurredAt: Date;
  actorId?: string;
  actorName?: string;
  summary?: string;
  dueDate?: Date;
  status?: string;
  rawData: RawActivityRecord;
}

async function fetchLeadActivities(leadZohoId: string): Promise<NormalizedActivity[]> {
  const results: NormalizedActivity[] = [];
  for (const spec of ACTIVITY_SPECS) {
    for (const relatedList of spec.relatedLists) {
      const records = await fetchRelatedList(leadZohoId, relatedList, spec.fields);
      for (const r of records) {
        const id = spec.getId ? spec.getId(r) : (r.id as string | undefined);
        if (!id) continue; // no stable identifier to dedupe on — drop rather than collide with every other record missing one
        const norm = spec.normalize(r, relatedList);
        results.push({ type: spec.type, zohoActivityId: id, rawData: r, ...norm });
      }
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// Sync
// ---------------------------------------------------------------------------

function mapLead(zohoLead: ZohoLead) {
  const owner = lookupName(zohoLead.Owner);
  const leadStatus = zohoLead.Lead_Status ?? null;
  const tags = Array.isArray(zohoLead.Tag)
    ? zohoLead.Tag.map((t) => (typeof t === "string" ? t : t?.name)).filter((t): t is string => Boolean(t))
    : [];

  return {
    fullName: zohoLead.Full_Name ?? null,
    firstName: zohoLead.First_Name ?? null,
    lastName: zohoLead.Last_Name ?? null,
    company: zohoLead.Company ?? null,
    email: zohoLead.Email ?? null,
    phone: zohoLead.Phone ?? null,
    leadSource: zohoLead.Lead_Source ?? null,
    description: zohoLead.Description ?? null,
    tags,
    leadStatus,
    funnelStage: computeFunnelStage(leadStatus),
    ownerId: owner.id ?? null,
    ownerName: owner.name ?? null,
    ownerEmail: (zohoLead.Owner as ZohoLookup | undefined)?.email ?? null,
    // "-None-" is a real picklist option in Zoho (not a blank field) — treat
    // it the same as actually blank rather than storing the literal string.
    staffName: zohoLead.Staff_Name && zohoLead.Staff_Name !== "-None-" ? zohoLead.Staff_Name : null,
    converted: Boolean(zohoLead.Converted__s),
    convertedAt: zohoLead.Converted_Date_Time ? new Date(zohoLead.Converted_Date_Time) : null,
    convertedAccountId: zohoLead.Converted_Account?.id ?? null,
    convertedContactId: zohoLead.Converted_Contact?.id ?? null,
    convertedDealId: zohoLead.Converted_Deal?.id ?? null,
    zohoCreatedTime: zohoLead.Created_Time ? new Date(zohoLead.Created_Time) : null,
    zohoModifiedTime: zohoLead.Modified_Time ? new Date(zohoLead.Modified_Time) : null,
    rawData: zohoLead as object,
  };
}

async function syncOneLead(zohoLead: ZohoLead) {
  const mapped = mapLead(zohoLead);
  const existing = await prisma.crmLead.findUnique({ where: { zohoId: zohoLead.id } });

  // Section 3.2/3.4: stage/owner history only exists from the moment this
  // feature runs — diff against whatever was previously stored, insert a
  // history row on a real change, then let the upsert below overwrite the
  // current-state columns as usual.
  if (existing) {
    if (existing.leadStatus !== mapped.leadStatus) {
      await prisma.crmLeadStageHistory.create({
        data: { leadId: existing.id, fromStage: existing.leadStatus, toStage: mapped.leadStatus ?? "(blank)" },
      });
    }
    if (existing.ownerId !== mapped.ownerId) {
      await prisma.crmLeadOwnerHistory.create({
        data: {
          leadId: existing.id,
          fromOwnerId: existing.ownerId,
          fromOwnerName: existing.ownerName,
          toOwnerId: mapped.ownerId,
          toOwnerName: mapped.ownerName,
        },
      });
    }
  }

  const lead = await prisma.crmLead.upsert({
    where: { zohoId: zohoLead.id },
    update: { ...mapped, syncedAt: new Date() },
    create: { zohoId: zohoLead.id, ...mapped, syncedAt: new Date() },
  });

  // First sync of a lead: record its initial owner as a history row too, so
  // "who it's assigned to and since when" has a starting point even for
  // leads that never change owner again.
  if (!existing && mapped.ownerId) {
    await prisma.crmLeadOwnerHistory.create({
      data: { leadId: lead.id, fromOwnerId: null, fromOwnerName: null, toOwnerId: mapped.ownerId, toOwnerName: mapped.ownerName },
    });
  }

  // Confirmed live against a real org: once a Lead is converted, Zoho moves
  // its Notes/Calls/Events/Tasks/Emails over to the resulting Account/
  // Contact/Deal — the related lists are no longer reachable via the Lead
  // endpoint at all (every one of them 400s with "id already converted").
  // Not a sync failure, just nothing left to fetch from this side; the
  // Converted_Account/Contact/Deal ids are already stored on the lead for
  // if a future report wants to follow the trail to where the activity
  // history actually lives now.
  const activities = mapped.converted ? [] : await fetchLeadActivities(zohoLead.id);
  let lastActivityAt = lead.lastActivityAt;
  for (const a of activities) {
    await prisma.crmLeadActivity.upsert({
      where: { leadId_activityType_zohoActivityId: { leadId: lead.id, activityType: a.type, zohoActivityId: a.zohoActivityId } },
      update: {
        occurredAt: a.occurredAt,
        actorId: a.actorId,
        actorName: a.actorName,
        summary: a.summary,
        dueDate: a.dueDate,
        status: a.status,
        rawData: a.rawData as object,
      },
      create: {
        leadId: lead.id,
        activityType: a.type,
        zohoActivityId: a.zohoActivityId,
        occurredAt: a.occurredAt,
        actorId: a.actorId,
        actorName: a.actorName,
        summary: a.summary,
        dueDate: a.dueDate,
        status: a.status,
        rawData: a.rawData as object,
      },
    });
    if (!lastActivityAt || a.occurredAt > lastActivityAt) lastActivityAt = a.occurredAt;
  }
  if (lastActivityAt && lastActivityAt !== lead.lastActivityAt) {
    await prisma.crmLead.update({ where: { id: lead.id }, data: { lastActivityAt } });
  }

  await prisma.crmLeadSyncLog.create({ data: { zohoLeadId: zohoLead.id, localLeadId: lead.id, status: "SUCCESS" } });
}

export interface CrmLeadsSyncResult {
  mode: "full" | "incremental";
  leadsFetched: number;
  leadsFailed: number;
}

// Section 4.1 (backfill) and 4.2 (ongoing incremental) share this one
// function: `full: true` (or no prior CrmSyncState row) walks the whole
// Leads module; otherwise it fetches only what changed since the stored
// cursor. Known gap (see README): a lead whose only change is a new
// Note/Call/etc. with no Lead field edit may not bump Modified_Time, so a
// long-idle-on-other-fields lead's activity feed could lag behind an
// incremental run — mitigated by the periodic full re-sync, not eliminated.
export async function runCrmLeadsSync(options: { full?: boolean } = {}): Promise<CrmLeadsSyncResult> {
  const state = await prisma.crmSyncState.findUnique({ where: { module: MODULE_NAME } });
  const isFull = options.full || !state?.lastSyncedModifiedTime;

  const zohoLeads = await fetchZohoLeads(isFull ? undefined : state!.lastSyncedModifiedTime!);
  console.log(`[crmLeadsSync] ${isFull ? "full backfill" : "incremental sync"}: ${zohoLeads.length} lead(s) to process`);

  let failed = 0;
  let maxModifiedSeen: Date | null = null;
  for (const zohoLead of zohoLeads) {
    try {
      await syncOneLead(zohoLead);
      if (zohoLead.Modified_Time) {
        const d = new Date(zohoLead.Modified_Time);
        if (!maxModifiedSeen || d > maxModifiedSeen) maxModifiedSeen = d;
      }
    } catch (err) {
      failed++;
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error(`[crmLeadsSync] lead ${zohoLead.id} failed:`, errorMessage);
      try {
        await prisma.crmLeadSyncLog.create({ data: { zohoLeadId: zohoLead.id, status: "FAILED", errorMessage } });
      } catch (logErr) {
        console.error(`[crmLeadsSync] failed to write sync log for lead ${zohoLead.id}:`, logErr);
      }
    }
  }

  await prisma.crmSyncState.upsert({
    where: { module: MODULE_NAME },
    update: {
      ...(maxModifiedSeen ? { lastSyncedModifiedTime: maxModifiedSeen } : {}),
      ...(isFull ? { lastFullSyncAt: new Date() } : {}),
      status: "OK",
    },
    create: {
      module: MODULE_NAME,
      lastSyncedModifiedTime: maxModifiedSeen,
      lastFullSyncAt: isFull ? new Date() : null,
      status: "OK",
    },
  });

  return { mode: isFull ? "full" : "incremental", leadsFetched: zohoLeads.length, leadsFailed: failed };
}

export async function getCrmLeadsSyncStatus() {
  const settings = await getEffectiveSettings();
  const configured = Boolean(settings.zohoClientId && settings.zohoClientSecret && settings.zohoRefreshToken);
  const state = await prisma.crmSyncState.findUnique({ where: { module: MODULE_NAME } });
  const lastLog = await prisma.crmLeadSyncLog.findFirst({ orderBy: { syncedAt: "desc" } });
  const recentFailures = await prisma.crmLeadSyncLog.count({
    where: { status: "FAILED" as ZohoSyncStatus, syncedAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
  });
  const leadCount = await prisma.crmLead.count();
  return { configured, state, lastLog, recentFailures, leadCount };
}

export async function listCrmLeadSyncLog() {
  return prisma.crmLeadSyncLog.findMany({ orderBy: { syncedAt: "desc" }, take: 200 });
}
