-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'CRM_BACKFILL_FAILED';

-- AlterTable
ALTER TABLE "app_config" ADD COLUMN     "crm_leads_backfill_cron_schedule" TEXT;
