-- AlterEnum
ALTER TYPE "TimesheetEntryType" ADD VALUE 'ACTIVITY';

-- CreateTable
CREATE TABLE "daily_activities" (
    "id" TEXT NOT NULL,
    "activity_type" "ActivityType" NOT NULL,
    "status" "ActivityLogStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "activity_date" TIMESTAMP(3) NOT NULL,
    "time_in" TIMESTAMP(3),
    "time_out" TIMESTAMP(3),
    "working_hours" DECIMAL(5,2) NOT NULL,
    "is_manual_override" BOOLEAN NOT NULL DEFAULT false,
    "override_reason" TEXT,
    "description" TEXT,
    "project_id" TEXT,
    "department_id" TEXT,
    "logged_by_id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "daily_activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_activity_attachments" (
    "id" TEXT NOT NULL,
    "daily_activity_id" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "file_path" TEXT NOT NULL,
    "file_size" INTEGER NOT NULL,
    "mime_type" TEXT NOT NULL,
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "daily_activity_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "daily_activities_logged_by_id_idx" ON "daily_activities"("logged_by_id");

-- CreateIndex
CREATE INDEX "daily_activities_activity_date_idx" ON "daily_activities"("activity_date");

-- AddForeignKey
ALTER TABLE "daily_activities" ADD CONSTRAINT "daily_activities_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_activities" ADD CONSTRAINT "daily_activities_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_activities" ADD CONSTRAINT "daily_activities_logged_by_id_fkey" FOREIGN KEY ("logged_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_activity_attachments" ADD CONSTRAINT "daily_activity_attachments_daily_activity_id_fkey" FOREIGN KEY ("daily_activity_id") REFERENCES "daily_activities"("id") ON DELETE CASCADE ON UPDATE CASCADE;
