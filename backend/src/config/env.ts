import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: Number(process.env.PORT ?? 4000),
  databaseUrl: required("DATABASE_URL"),
  jwtSecret: required("JWT_SECRET"),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? "12h",
  corsOrigin: process.env.CORS_ORIGIN ?? "http://localhost:5173",
  uploadDir: process.env.UPLOAD_DIR ?? "uploads",

  smtpHost: process.env.SMTP_HOST ?? "",
  smtpPort: Number(process.env.SMTP_PORT ?? 587),
  smtpUser: process.env.SMTP_USER ?? "",
  smtpPassword: process.env.SMTP_PASSWORD ?? "",
  smtpFrom: process.env.SMTP_FROM ?? "Task Management <no-reply@example.com>",

  notificationCronSchedule: process.env.NOTIFICATION_CRON_SCHEDULE ?? "0 * * * *",
  weeklyReportCronSchedule: process.env.WEEKLY_REPORT_CRON_SCHEDULE ?? "0 8 * * 1",

  zohoClientId: process.env.ZOHO_CLIENT_ID ?? "",
  zohoClientSecret: process.env.ZOHO_CLIENT_SECRET ?? "",
  zohoRefreshToken: process.env.ZOHO_REFRESH_TOKEN ?? "",
  zohoAccountsBaseUrl: process.env.ZOHO_ACCOUNTS_BASE_URL ?? "https://accounts.zoho.com",
  zohoApiBaseUrl: process.env.ZOHO_API_BASE_URL ?? "https://www.zohoapis.com",
  zohoPollIntervalMinutes: Number(process.env.ZOHO_POLL_INTERVAL_MINUTES ?? 15),
  zohoFallbackAssigneeEmail: process.env.ZOHO_FALLBACK_ASSIGNEE_EMAIL ?? "",
};
