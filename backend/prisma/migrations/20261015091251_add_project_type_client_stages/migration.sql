-- CreateEnum
CREATE TYPE "ProjectType" AS ENUM ('GENERAL', 'CLIENT');

-- AlterEnum
ALTER TYPE "ProjectStatus" ADD VALUE 'LOST';

-- AlterTable
ALTER TABLE "daily_activities" ADD COLUMN     "milestone_id" TEXT;

-- AlterTable
ALTER TABLE "milestones" ADD COLUMN     "completed_at" TIMESTAMP(3),
ADD COLUMN     "completed_by_id" TEXT,
ADD COLUMN     "sort_order" INTEGER;

-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "type" "ProjectType" NOT NULL DEFAULT 'GENERAL';

-- CreateIndex
CREATE INDEX "daily_activities_milestone_id_idx" ON "daily_activities"("milestone_id");

-- AddForeignKey
ALTER TABLE "milestones" ADD CONSTRAINT "milestones_completed_by_id_fkey" FOREIGN KEY ("completed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_activities" ADD CONSTRAINT "daily_activities_milestone_id_fkey" FOREIGN KEY ("milestone_id") REFERENCES "milestones"("id") ON DELETE SET NULL ON UPDATE CASCADE;
