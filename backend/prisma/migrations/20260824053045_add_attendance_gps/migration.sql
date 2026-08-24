-- AlterTable
ALTER TABLE "attendance_records" ADD COLUMN     "check_in_lat" DOUBLE PRECISION,
ADD COLUMN     "check_in_lng" DOUBLE PRECISION,
ADD COLUMN     "check_out_lat" DOUBLE PRECISION,
ADD COLUMN     "check_out_lng" DOUBLE PRECISION;
