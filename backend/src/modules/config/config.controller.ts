import { Request, Response } from "express";
import { z } from "zod";
import * as service from "./config.service";
import { AppConfig } from "@prisma/client";
import { rescheduleEscalationCron } from "../../jobs/escalationCron";
import { rescheduleWeeklyReportCron } from "../../jobs/weeklyReportCron";

const updateSchema = z.object({
  smtpHost: z.string().nullable().optional(),
  smtpPort: z.number().int().nullable().optional(),
  smtpUser: z.string().nullable().optional(),
  smtpPassword: z.string().min(1).nullable().optional(),
  smtpFrom: z.string().nullable().optional(),
  zohoClientId: z.string().nullable().optional(),
  zohoClientSecret: z.string().min(1).nullable().optional(),
  zohoRefreshToken: z.string().min(1).nullable().optional(),
  zohoAccountsBaseUrl: z.string().nullable().optional(),
  zohoApiBaseUrl: z.string().nullable().optional(),
  notificationCronSchedule: z.string().nullable().optional(),
  weeklyReportCronSchedule: z.string().nullable().optional(),
});

// Never echo secret values back — only whether one is currently set, and (for
// every field) whether the value shown is a DB override or the .env fallback.
// Secret fields follow the same omit/null/value convention as everything
// else now: omitted = leave the stored value untouched, null = clear it back
// to the .env fallback, a string = set it.
async function toDisplayShape() {
  const [config, effective] = await Promise.all([service.getAppConfig(), service.getEffectiveSettings()]);
  const isOverridden = (key: keyof AppConfig) => (config as Record<string, unknown> | null)?.[key] != null;

  return {
    smtpHost: effective.smtpHost,
    smtpPort: effective.smtpPort,
    smtpUser: effective.smtpUser,
    smtpPasswordSet: Boolean(effective.smtpPassword),
    smtpFrom: effective.smtpFrom,
    zohoClientId: effective.zohoClientId,
    zohoClientSecretSet: Boolean(effective.zohoClientSecret),
    zohoRefreshTokenSet: Boolean(effective.zohoRefreshToken),
    zohoAccountsBaseUrl: effective.zohoAccountsBaseUrl,
    zohoApiBaseUrl: effective.zohoApiBaseUrl,
    notificationCronSchedule: effective.notificationCronSchedule,
    weeklyReportCronSchedule: effective.weeklyReportCronSchedule,
    overrides: {
      smtpHost: isOverridden("smtpHost"),
      smtpPort: isOverridden("smtpPort"),
      smtpUser: isOverridden("smtpUser"),
      smtpPassword: isOverridden("smtpPassword"),
      smtpFrom: isOverridden("smtpFrom"),
      zohoClientId: isOverridden("zohoClientId"),
      zohoClientSecret: isOverridden("zohoClientSecret"),
      zohoRefreshToken: isOverridden("zohoRefreshToken"),
      zohoAccountsBaseUrl: isOverridden("zohoAccountsBaseUrl"),
      zohoApiBaseUrl: isOverridden("zohoApiBaseUrl"),
      notificationCronSchedule: isOverridden("notificationCronSchedule"),
      weeklyReportCronSchedule: isOverridden("weeklyReportCronSchedule"),
    },
  };
}

export async function getConfigHandler(_req: Request, res: Response) {
  res.json(await toDisplayShape());
}

export async function updateConfigHandler(req: Request, res: Response) {
  const body = updateSchema.parse(req.body);
  await service.updateAppConfig(body);

  // Cron schedules take effect immediately — tear down and recreate the
  // running job instead of requiring a server restart.
  if ("notificationCronSchedule" in body || "weeklyReportCronSchedule" in body) {
    const effective = await service.getEffectiveSettings();
    if ("notificationCronSchedule" in body) rescheduleEscalationCron(effective.notificationCronSchedule);
    if ("weeklyReportCronSchedule" in body) rescheduleWeeklyReportCron(effective.weeklyReportCronSchedule);
  }

  res.json(await toDisplayShape());
}
