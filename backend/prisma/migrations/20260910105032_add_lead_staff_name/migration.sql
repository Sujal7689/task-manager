-- AlterTable
ALTER TABLE "crm_leads" ADD COLUMN     "staff_name" TEXT;

-- CreateIndex
CREATE INDEX "crm_leads_staff_name_idx" ON "crm_leads"("staff_name");
