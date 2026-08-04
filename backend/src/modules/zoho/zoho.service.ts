import { Priority, TaskStatus } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { env } from "../../config/env";
import { notify } from "../notifications/notifications.service";

// ---------------------------------------------------------------------------
// OAuth2 (Section 9, 6.12): this app is a "self client" consumer — the Admin
// obtains a refresh token once via Zoho's API console (outside this app) and
// puts it in .env. We do not implement the interactive consent redirect
// (would require a public, fixed callback URL, which self-hosted deployments
// of this scale often don't have). See README "Known gaps".
// ---------------------------------------------------------------------------

let cachedToken: { accessToken: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 30_000) {
    return cachedToken.accessToken;
  }
  if (!env.zohoClientId || !env.zohoClientSecret || !env.zohoRefreshToken) {
    throw new Error("Zoho OAuth credentials are not configured");
  }

  const params = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: env.zohoClientId,
    client_secret: env.zohoClientSecret,
    refresh_token: env.zohoRefreshToken,
  });

  const res = await fetch(`${env.zohoAccountsBaseUrl}/oauth/v2/token?${params.toString()}`, { method: "POST" });
  if (!res.ok) throw new Error(`Zoho token refresh failed: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { access_token: string; expires_in: number };

  cachedToken = { accessToken: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return cachedToken.accessToken;
}

interface ZohoTask {
  id: string;
  Subject?: string;
  Due_Date?: string;
  Status?: string;
  Priority?: string;
  Owner?: { email?: string; full_name?: string };
  What_Id?: { name?: string } | null;
  // Custom fields (e.g. the "Staff Name" picklist) come back on the record
  // under whatever API name Zoho gave them — not modeled individually here.
  [customField: string]: unknown;
}

// API name of the custom "Staff Name" picklist field on the Zoho Tasks module.
// Confirm the real API name in Zoho Setup > Customization > Modules > Tasks >
// Fields (it may differ from this guess) and update this constant to match.
const ZOHO_STAFF_NAME_FIELD = "Staff_Name";

// v6 requires an explicit field list (unlike v2, which defaulted to all fields).
const ZOHO_TASK_FIELDS = ["id", "Subject", "Due_Date", "Status", "Priority", "Owner", "What_Id", ZOHO_STAFF_NAME_FIELD].join(",");

async function fetchZohoTasks(): Promise<ZohoTask[]> {
  const token = await getAccessToken();
  const all: ZohoTask[] = [];
  let page = 1;
  // Section 6.12 scope: all records from the Tasks module, no filtering.
  while (true) {
    const res = await fetch(`${env.zohoApiBaseUrl}/crm/v6/Tasks?page=${page}&per_page=200&fields=${ZOHO_TASK_FIELDS}`, {
      headers: { Authorization: `Zoho-oauthtoken ${token}` },
    });
    if (res.status === 204) break; // no more records
    if (!res.ok) throw new Error(`Zoho Tasks fetch failed: ${res.status} ${await res.text()}`);
    const body = (await res.json()) as { data?: ZohoTask[]; info?: { more_records?: boolean } };
    all.push(...(body.data ?? []));
    if (!body.info?.more_records) break;
    page++;
  }
  return all;
}

const STATUS_MAP: Record<string, TaskStatus> = {
  "Not Started": "NOT_STARTED",
  Deferred: "NOT_STARTED",
  "In Progress": "IN_PROGRESS",
  Completed: "COMPLETED",
};

const PRIORITY_MAP: Record<string, Priority> = {
  Highest: "CRITICAL",
  High: "HIGH",
  Normal: "MEDIUM",
  Low: "LOW",
};

// Loose match so "Harsh" (Zoho picklist) matches "Harsh Singhania" (local user
// name) without requiring an exact, manually-maintained mapping table.
function staffNameMatches(staffName: string, userName: string): boolean {
  const a = staffName.trim().toLowerCase();
  const b = userName.trim().toLowerCase();
  if (!a || !b) return false;
  return a === b || b.split(/\s+/)[0] === a || b.includes(a) || a.includes(b);
}

async function resolveAssignee(zohoTask: ZohoTask): Promise<{ userId: string; matched: boolean }> {
  const staffName = zohoTask[ZOHO_STAFF_NAME_FIELD];
  if (typeof staffName === "string" && staffName.trim()) {
    const activeUsers = await prisma.user.findMany({ where: { status: "ACTIVE" }, select: { id: true, name: true } });
    const match = activeUsers.find((u) => staffNameMatches(staffName, u.name));
    if (match) return { userId: match.id, matched: true };
  }

  const ownerEmail = zohoTask.Owner?.email;
  if (ownerEmail) {
    const match = await prisma.user.findUnique({ where: { email: ownerEmail } });
    if (match) return { userId: match.id, matched: true };
  }

  const fallback = await prisma.user.findFirst({ where: { isZohoFallbackAssignee: true, status: "ACTIVE" } });
  if (!fallback) throw new Error("No Zoho Fallback Assignee is configured (Section 5.2) and neither Staff Name nor Owner email matched any user");
  return { userId: fallback.id, matched: false };
}

interface ZohoDefaults {
  companyId: string;
  departmentId: string;
  categoryId: string;
}

// Every task pulled from Zoho CRM is filed under a fixed company/department/
// category (per Admin's instruction) — sub-category, milestone and estimated
// hours are deliberately left blank for someone to fill in locally.
async function resolveZohoDefaults(): Promise<ZohoDefaults> {
  const company = await prisma.company.findFirst({ where: { name: "Tradeila" } });
  if (!company) throw new Error("Zoho sync default company 'Tradeila' not found — create it in Admin > Companies first");

  const department = await prisma.department.findFirst({ where: { name: "Marketing", companyId: company.id } });
  if (!department) throw new Error("Zoho sync default department 'Marketing' not found under Tradeila — create it in Admin > Departments first");

  let category = await prisma.category.findFirst({ where: { name: "Marketing", parentId: null } });
  if (!category) {
    category = await prisma.category.create({ data: { name: "Marketing" } });
  }

  return { companyId: company.id, departmentId: department.id, categoryId: category.id };
}

async function syncOneTask(zohoTask: ZohoTask, defaults: ZohoDefaults) {
  const { userId: assigneeId, matched } = await resolveAssignee(zohoTask);

  const mapped = {
    name: zohoTask.Subject ?? "(untitled Zoho task)",
    dueDate: zohoTask.Due_Date ? new Date(zohoTask.Due_Date) : null,
    status: (zohoTask.Status && STATUS_MAP[zohoTask.Status]) || "NOT_STARTED",
    priority: (zohoTask.Priority && PRIORITY_MAP[zohoTask.Priority]) || "MEDIUM",
    partyName: zohoTask.What_Id?.name ?? null,
  };

  const existing = await prisma.task.findUnique({ where: { zohoTaskId: zohoTask.id } });

  let localTask;
  if (existing) {
    // One-way sync (Section 6.12): Zoho always wins on mapped fields.
    localTask = await prisma.task.update({
      where: { id: existing.id },
      data: { ...mapped, lastSyncedAt: new Date() },
    });
  } else {
    const taskNumber = `ZOHO-${zohoTask.id}`;
    localTask = await prisma.task.create({
      data: {
        taskNumber,
        name: mapped.name,
        dueDate: mapped.dueDate,
        status: mapped.status,
        priority: mapped.priority,
        partyName: mapped.partyName,
        source: "ZOHO_CRM",
        zohoTaskId: zohoTask.id,
        lastSyncedAt: new Date(),
        assignedById: assigneeId,
        refId: zohoTask.id,
        companyId: defaults.companyId,
        departmentId: defaults.departmentId,
        categoryId: defaults.categoryId,
        assignees: { create: [{ userId: assigneeId }] },
      },
    });

    if (!matched) {
      await notify({
        recipientId: assigneeId,
        type: "UNMATCHED_ZOHO_OWNER",
        message: `Synced Zoho task "${mapped.name}" has no matching local user for its Owner — routed to you as the fallback assignee. Please reassign.`,
        taskId: localTask.id,
        sendEmailToo: true,
      });
    }
  }

  await prisma.zohoSyncLog.create({
    data: { zohoTaskId: zohoTask.id, localTaskId: localTask.id, status: "SUCCESS" },
  });
}

export async function runZohoSync() {
  const zohoTasks = await fetchZohoTasks();
  const defaults = await resolveZohoDefaults();
  for (const zohoTask of zohoTasks) {
    try {
      await syncOneTask(zohoTask, defaults);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error(`[zohoSync] task ${zohoTask.id} failed:`, errorMessage);
      try {
        await prisma.zohoSyncLog.create({
          data: { zohoTaskId: zohoTask.id, status: "FAILED", errorMessage },
        });
      } catch (logErr) {
        // A broken log write must not abort the rest of the sync run.
        console.error(`[zohoSync] failed to write sync log for task ${zohoTask.id}:`, logErr);
      }
    }
  }
  return { synced: zohoTasks.length };
}

export async function getConnectionStatus() {
  const configured = Boolean(env.zohoClientId && env.zohoClientSecret && env.zohoRefreshToken);
  const lastSync = await prisma.zohoSyncLog.findFirst({ orderBy: { syncedAt: "desc" } });
  const recentFailures = await prisma.zohoSyncLog.count({
    where: { status: "FAILED", syncedAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
  });
  return { configured, lastSync, recentFailures };
}

export async function listSyncLog() {
  return prisma.zohoSyncLog.findMany({ orderBy: { syncedAt: "desc" }, take: 200 });
}
