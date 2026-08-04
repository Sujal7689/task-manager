import { prisma } from "../../config/prisma";
import { env } from "../../config/env";

// Single global settings row — always looked up/written via this fixed id.
const SINGLETON_ID = "singleton";

export function getAppConfig() {
  return prisma.appConfig.findUnique({ where: { id: SINGLETON_ID } });
}

export interface EffectiveSettings {
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPassword: string;
  smtpFrom: string;
  zohoClientId: string;
  zohoClientSecret: string;
  zohoRefreshToken: string;
  zohoAccountsBaseUrl: string;
  zohoApiBaseUrl: string;
  notificationCronSchedule: string;
  weeklyReportCronSchedule: string;
}

// Every runtime-configurable setting: the database override if set, else the
// matching .env value — the single place mailer/zoho/cron code should read from.
export async function getEffectiveSettings(): Promise<EffectiveSettings> {
  const config = await getAppConfig();
  return {
    smtpHost: config?.smtpHost ?? env.smtpHost,
    smtpPort: config?.smtpPort ?? env.smtpPort,
    smtpUser: config?.smtpUser ?? env.smtpUser,
    smtpPassword: config?.smtpPassword ?? env.smtpPassword,
    smtpFrom: config?.smtpFrom ?? env.smtpFrom,
    zohoClientId: config?.zohoClientId ?? env.zohoClientId,
    zohoClientSecret: config?.zohoClientSecret ?? env.zohoClientSecret,
    zohoRefreshToken: config?.zohoRefreshToken ?? env.zohoRefreshToken,
    zohoAccountsBaseUrl: config?.zohoAccountsBaseUrl ?? env.zohoAccountsBaseUrl,
    zohoApiBaseUrl: config?.zohoApiBaseUrl ?? env.zohoApiBaseUrl,
    notificationCronSchedule: config?.notificationCronSchedule ?? env.notificationCronSchedule,
    weeklyReportCronSchedule: config?.weeklyReportCronSchedule ?? env.weeklyReportCronSchedule,
  };
}

// Every field follows the same convention: omitting a key leaves it
// untouched, `null` clears the DB override (falls back to .env again), and a
// value sets it. Secret fields (smtpPassword, zohoClientSecret,
// zohoRefreshToken) are never echoed back by the API regardless.
export interface UpdateConfigInput {
  smtpHost?: string | null;
  smtpPort?: number | null;
  smtpUser?: string | null;
  smtpPassword?: string | null;
  smtpFrom?: string | null;
  zohoClientId?: string | null;
  zohoClientSecret?: string | null;
  zohoRefreshToken?: string | null;
  zohoAccountsBaseUrl?: string | null;
  zohoApiBaseUrl?: string | null;
  notificationCronSchedule?: string | null;
  weeklyReportCronSchedule?: string | null;
}

export async function updateAppConfig(input: UpdateConfigInput) {
  // Prisma already treats an absent key as "don't touch" and an explicit
  // `null` as "set to null" for both update and create — input can be passed
  // straight through without any extra branching.
  return prisma.appConfig.upsert({
    where: { id: SINGLETON_ID },
    update: input,
    create: { id: SINGLETON_ID, ...input },
  });
}
