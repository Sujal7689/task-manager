import cron from "node-cron";
import { env } from "../config/env";
import { sendWeeklySummaryEmails } from "../modules/reports/reports.service";

export function startWeeklyReportCron() {
  cron.schedule(env.weeklyReportCronSchedule, () => {
    sendWeeklySummaryEmails().catch((err) => console.error("[weeklyReportCron] run failed:", err));
  });
  console.log(`[weeklyReportCron] scheduled with "${env.weeklyReportCronSchedule}"`);
}
