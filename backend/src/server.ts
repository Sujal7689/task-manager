import { app } from "./app";
import { env } from "./config/env";
import { startEscalationCron } from "./jobs/escalationCron";
import { startWeeklyReportCron } from "./jobs/weeklyReportCron";
import { startCrmLeadsSyncCron } from "./jobs/crmLeadsSyncCron";
import { startCrmLeadsBackfillCron } from "./jobs/crmLeadsBackfillCron";

app.listen(env.port, () => {
  console.log(`Backend listening on port ${env.port}`);
  startEscalationCron().catch((err) => console.error("[escalationCron] failed to start:", err));
  startWeeklyReportCron().catch((err) => console.error("[weeklyReportCron] failed to start:", err));
  startCrmLeadsSyncCron().catch((err) => console.error("[crmLeadsSyncCron] failed to start:", err));
  startCrmLeadsBackfillCron().catch((err) => console.error("[crmLeadsBackfillCron] failed to start:", err));
});
