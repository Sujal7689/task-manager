import { app } from "./app";
import { env } from "./config/env";
import { startEscalationCron } from "./jobs/escalationCron";
import { startWeeklyReportCron } from "./jobs/weeklyReportCron";

app.listen(env.port, () => {
  console.log(`Backend listening on port ${env.port}`);
  startEscalationCron();
  startWeeklyReportCron();
});
