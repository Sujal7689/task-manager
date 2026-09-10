-- AlterTable
ALTER TABLE "crm_lead_activity" ADD COLUMN     "due_date" TIMESTAMP(3),
ADD COLUMN     "status" TEXT;

-- CreateIndex
CREATE INDEX "crm_lead_activity_activity_type_due_date_idx" ON "crm_lead_activity"("activity_type", "due_date");
