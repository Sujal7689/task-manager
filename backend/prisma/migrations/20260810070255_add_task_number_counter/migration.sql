-- CreateTable
CREATE TABLE "task_number_counter" (
    "scope" TEXT NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "task_number_counter_pkey" PRIMARY KEY ("scope")
);
