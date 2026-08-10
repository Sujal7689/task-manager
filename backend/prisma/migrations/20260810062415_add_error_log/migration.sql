-- CreateTable
CREATE TABLE "error_log" (
    "id" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "status_code" INTEGER NOT NULL,
    "message" TEXT NOT NULL,
    "stack" TEXT,
    "user_id" TEXT,
    "user_role" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "error_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "error_log_created_at_idx" ON "error_log"("created_at");
