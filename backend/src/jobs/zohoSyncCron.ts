import cron from "node-cron";
import { env } from "../config/env";
import { runZohoSync } from "../modules/zoho/zoho.service";

export function startZohoSyncCron() {
  if (!env.zohoClientId || !env.zohoRefreshToken) {
    console.log("[zohoSyncCron] Zoho credentials not configured — polling disabled until Admin connects Zoho.");
    return;
  }
  const schedule = `*/${env.zohoPollIntervalMinutes} * * * *`;
  cron.schedule(schedule, () => {
    runZohoSync().catch((err) => console.error("[zohoSyncCron] run failed:", err));
  });
  console.log(`[zohoSyncCron] scheduled every ${env.zohoPollIntervalMinutes} minute(s)`);
}
