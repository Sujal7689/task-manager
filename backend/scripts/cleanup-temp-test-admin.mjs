import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  const user = await prisma.user.findUnique({ where: { email: "temp-verify@example.com" } });
  if (!user) {
    console.log("already gone");
    return;
  }
  const activityLogs = await prisma.activityLog.deleteMany({ where: { loggedById: user.id } });
  const timesheetEntries = await prisma.timesheetEntry.deleteMany({ where: { userId: user.id } });
  await prisma.user.delete({ where: { id: user.id } });
  console.log(`Deleted ${activityLogs.count} activity logs, ${timesheetEntries.count} timesheet entries, and the temp user.`);
}

main().finally(() => prisma.$disconnect());
