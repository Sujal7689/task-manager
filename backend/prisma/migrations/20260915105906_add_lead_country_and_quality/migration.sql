-- CreateEnum
CREATE TYPE "CrmLeadQuality" AS ENUM ('POTENTIAL_DEAL', 'NURTURING', 'UNQUALIFIED');

-- AlterTable
ALTER TABLE "crm_leads" ADD COLUMN     "country" TEXT,
ADD COLUMN     "lead_quality" "CrmLeadQuality";

-- CreateIndex
CREATE INDEX "crm_leads_country_idx" ON "crm_leads"("country");

-- CreateIndex
CREATE INDEX "crm_leads_lead_quality_idx" ON "crm_leads"("lead_quality");
