-- CreateEnum
CREATE TYPE "CrmActivityType" AS ENUM ('NOTE', 'CALL', 'EVENT', 'TASK', 'EMAIL');

-- AlterTable
ALTER TABLE "app_config" ADD COLUMN     "crm_leads_sync_cron_schedule" TEXT;

-- CreateTable
CREATE TABLE "crm_leads" (
    "id" TEXT NOT NULL,
    "zoho_id" TEXT NOT NULL,
    "full_name" TEXT,
    "first_name" TEXT,
    "last_name" TEXT,
    "company" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "lead_source" TEXT,
    "description" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "lead_status" TEXT,
    "funnel_stage" TEXT,
    "owner_id" TEXT,
    "owner_name" TEXT,
    "owner_email" TEXT,
    "converted" BOOLEAN NOT NULL DEFAULT false,
    "converted_at" TIMESTAMP(3),
    "converted_account_id" TEXT,
    "converted_contact_id" TEXT,
    "converted_deal_id" TEXT,
    "zoho_created_time" TIMESTAMP(3),
    "zoho_modified_time" TIMESTAMP(3),
    "last_activity_at" TIMESTAMP(3),
    "raw_data" JSONB NOT NULL,
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "crm_leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_lead_activity" (
    "id" TEXT NOT NULL,
    "lead_id" TEXT NOT NULL,
    "activity_type" "CrmActivityType" NOT NULL,
    "zoho_activity_id" TEXT NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "actor_id" TEXT,
    "actor_name" TEXT,
    "summary" TEXT,
    "raw_data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crm_lead_activity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_lead_stage_history" (
    "id" TEXT NOT NULL,
    "lead_id" TEXT NOT NULL,
    "from_stage" TEXT,
    "to_stage" TEXT NOT NULL,
    "changed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crm_lead_stage_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_lead_owner_history" (
    "id" TEXT NOT NULL,
    "lead_id" TEXT NOT NULL,
    "from_owner_id" TEXT,
    "from_owner_name" TEXT,
    "to_owner_id" TEXT,
    "to_owner_name" TEXT,
    "changed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crm_lead_owner_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_sync_state" (
    "module" TEXT NOT NULL,
    "last_synced_modified_time" TIMESTAMP(3),
    "last_full_sync_at" TIMESTAMP(3),
    "status" TEXT,

    CONSTRAINT "crm_sync_state_pkey" PRIMARY KEY ("module")
);

-- CreateTable
CREATE TABLE "crm_lead_sync_log" (
    "id" TEXT NOT NULL,
    "zoho_lead_id" TEXT NOT NULL,
    "local_lead_id" TEXT,
    "status" "ZohoSyncStatus" NOT NULL,
    "error_message" TEXT,
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crm_lead_sync_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "crm_leads_zoho_id_key" ON "crm_leads"("zoho_id");

-- CreateIndex
CREATE INDEX "crm_leads_funnel_stage_idx" ON "crm_leads"("funnel_stage");

-- CreateIndex
CREATE INDEX "crm_leads_owner_id_idx" ON "crm_leads"("owner_id");

-- CreateIndex
CREATE INDEX "crm_leads_zoho_modified_time_idx" ON "crm_leads"("zoho_modified_time");

-- CreateIndex
CREATE INDEX "crm_lead_activity_lead_id_occurred_at_idx" ON "crm_lead_activity"("lead_id", "occurred_at");

-- CreateIndex
CREATE INDEX "crm_lead_activity_actor_id_idx" ON "crm_lead_activity"("actor_id");

-- CreateIndex
CREATE UNIQUE INDEX "crm_lead_activity_lead_id_activity_type_zoho_activity_id_key" ON "crm_lead_activity"("lead_id", "activity_type", "zoho_activity_id");

-- CreateIndex
CREATE INDEX "crm_lead_stage_history_lead_id_idx" ON "crm_lead_stage_history"("lead_id");

-- CreateIndex
CREATE INDEX "crm_lead_stage_history_changed_at_idx" ON "crm_lead_stage_history"("changed_at");

-- CreateIndex
CREATE INDEX "crm_lead_owner_history_lead_id_idx" ON "crm_lead_owner_history"("lead_id");

-- CreateIndex
CREATE INDEX "crm_lead_owner_history_changed_at_idx" ON "crm_lead_owner_history"("changed_at");

-- CreateIndex
CREATE INDEX "crm_lead_sync_log_status_idx" ON "crm_lead_sync_log"("status");

-- AddForeignKey
ALTER TABLE "crm_lead_activity" ADD CONSTRAINT "crm_lead_activity_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "crm_leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_lead_stage_history" ADD CONSTRAINT "crm_lead_stage_history_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "crm_leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_lead_owner_history" ADD CONSTRAINT "crm_lead_owner_history_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "crm_leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
