import cron, { ScheduledTask } from "node-cron";
import { getEffectiveSettings } from "../modules/config/config.service";
import { runCrmLeadsSync } from "../modules/crmLeads/crmLeads.service";

// Section 4.2: incremental poll, same node-cron pattern as escalationCron.
// Always runs incremental (never `full`) — the full backfill is a deliberate
// Admin-triggered action (Admin > Zoho CRM > "Run full backfill"), not
// something that should happen automatically on a schedule.
async function runIncrementalSync() {
  try {
    await runCrmLeadsSync({ full: false });
  } catch (err) {
    console.error("[crmLeadsSyncCron] run failed:", err);
  }
}

let task: ScheduledTask | null = null;

export async function startCrmLeadsSyncCron() {
  const { crmLeadsSyncCronSchedule } = await getEffectiveSettings();
  if (!crmLeadsSyncCronSchedule) return; // not configured — Zoho creds likely absent too; skip rather than poll and fail every tick
  task = cron.schedule(crmLeadsSyncCronSchedule, runIncrementalSync);
  console.log(`[crmLeadsSyncCron] scheduled with "${crmLeadsSyncCronSchedule}"`);
}

export function rescheduleCrmLeadsSyncCron(schedule: string) {
  task?.stop();
  task = cron.schedule(schedule, runIncrementalSync);
  console.log(`[crmLeadsSyncCron] rescheduled with "${schedule}"`);
}

export { runIncrementalSync };
