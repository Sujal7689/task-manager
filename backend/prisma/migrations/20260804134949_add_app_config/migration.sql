-- CreateTable
CREATE TABLE "app_config" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "smtp_host" TEXT,
    "smtp_port" INTEGER,
    "smtp_user" TEXT,
    "smtp_password" TEXT,
    "smtp_from" TEXT,
    "zoho_client_id" TEXT,
    "zoho_client_secret" TEXT,
    "zoho_refresh_token" TEXT,
    "zoho_accounts_base_url" TEXT,
    "zoho_api_base_url" TEXT,
    "notification_cron_schedule" TEXT,
    "weekly_report_cron_schedule" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_config_pkey" PRIMARY KEY ("id")
);
