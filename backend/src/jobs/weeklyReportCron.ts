import cron, { ScheduledTask } from "node-cron";
import { sendWeeklySummaryEmails } from "../modules/reports/reports.service";
import { getEffectiveSettings } from "../modules/config/config.service";

function runWeeklyReport() {
  sendWeeklySummaryEmails().catch((err) => console.error("[weeklyReportCron] run failed:", err));
}

let task: ScheduledTask | null = null;

export async function startWeeklyReportCron() {
  const { weeklyReportCronSchedule } = await getEffectiveSettings();
  task = cron.schedule(weeklyReportCronSchedule, runWeeklyReport);
  console.log(`[weeklyReportCron] scheduled with "${weeklyReportCronSchedule}"`);
}

// Called from the Configuration tab when the schedule changes — replaces the
// running job without needing a server restart.
export function rescheduleWeeklyReportCron(schedule: string) {
  task?.stop();
  task = cron.schedule(schedule, runWeeklyReport);
  console.log(`[weeklyReportCron] rescheduled with "${schedule}"`);
}
