import cron, { ScheduledTask } from "node-cron";
import { getEffectiveSettings } from "../modules/config/config.service";
import { runCrmLeadsSync } from "../modules/crmLeads/crmLeads.service";
import { notify } from "../modules/notifications/notifications.service";
import { prisma } from "../config/prisma";

// Client direction: on top of the 15-min incremental poll (crmLeadsSyncCron),
// a full backfill should also run automatically every hour — incremental
// sync only catches leads whose Modified_Time changed, which misses cases
// like a custom field (e.g. Staff Name) being backfilled onto older leads
// without an accompanying field edit. A failed run must never take the app
// down — every failure is caught here and turned into an Admin-facing
// notification instead of being left to a raw exception or a silent gap.
async function notifyAdmins(message: string) {
  const admins = await prisma.user.findMany({ where: { role: "ADMIN", status: "ACTIVE" }, select: { id: true } });
  await Promise.all(admins.map((a) => notify({ recipientId: a.id, type: "CRM_BACKFILL_FAILED", message, sendEmailToo: true })));
}

async function runHourlyBackfill() {
  try {
    const result = await runCrmLeadsSync({ full: true });
    if (result.leadsFailed > 0) {
      await notifyAdmins(
        `Hourly Zoho CRM full backfill completed with ${result.leadsFailed} of ${result.leadsFetched} lead(s) failing to sync. Check Admin → Zoho CRM → sync log for details.`,
      );
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[crmLeadsBackfillCron] run failed:", err);
    // Best-effort — if even the notification write fails (e.g. the DB itself
    // is unreachable), there's nothing more this job can safely do.
    await notifyAdmins(`Hourly Zoho CRM full backfill did not run: ${message}`).catch((notifyErr) =>
      console.error("[crmLeadsBackfillCron] failed to notify admins:", notifyErr),
    );
  }
}

let task: ScheduledTask | null = null;

export async function startCrmLeadsBackfillCron() {
  const { crmLeadsBackfillCronSchedule } = await getEffectiveSettings();
  if (!crmLeadsBackfillCronSchedule) return; // not configured — Zoho creds likely absent too; skip rather than poll and fail every tick
  task = cron.schedule(crmLeadsBackfillCronSchedule, runHourlyBackfill);
  console.log(`[crmLeadsBackfillCron] scheduled with "${crmLeadsBackfillCronSchedule}"`);
}

export function rescheduleCrmLeadsBackfillCron(schedule: string) {
  task?.stop();
  task = cron.schedule(schedule, runHourlyBackfill);
  console.log(`[crmLeadsBackfillCron] rescheduled with "${schedule}"`);
}

export { runHourlyBackfill };
