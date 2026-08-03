// One-off cleanup: removes test artifacts created while building/verifying
// the app (RBAC/KPI test tasks, "KPI Test User" accounts, the "Manager
// scoping" test project), while preserving real data (Tradeila company,
// Website Revamp seed project, and the 4 demo login accounts).
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const TASK_NAME_PATTERNS = [
  "Smoke test task",
  "Copy of Smoke test task",
  "Not for staff",
  "Bulk imported task 1",
  "Bulk imported task 2",
];
const TASK_PREFIXES = ["RBAC visible", "RBAC hidden", "KPI task", "Manager scoping"];
const PROJECT_PREFIXES = ["Manager scoping project"];
const USER_EMAIL_PREFIX = "kpi-test-";

async function main() {
  const tasks = await prisma.task.findMany({
    where: {
      OR: [
        { name: { in: TASK_NAME_PATTERNS } },
        ...TASK_PREFIXES.map((p) => ({ name: { startsWith: p } })),
      ],
    },
    select: { id: true, name: true },
  });
  const taskIds = tasks.map((t) => t.id);

  const projects = await prisma.project.findMany({
    where: { OR: PROJECT_PREFIXES.map((p) => ({ name: { startsWith: p } })) },
    select: { id: true, name: true },
  });
  const projectIds = projects.map((p) => p.id);

  const users = await prisma.user.findMany({
    where: { email: { startsWith: USER_EMAIL_PREFIX } },
    select: { id: true, name: true, email: true },
  });
  const userIds = users.map((u) => u.id);

  console.log(`Found ${taskIds.length} test tasks, ${projectIds.length} test projects, ${userIds.length} test users.`);
  tasks.forEach((t) => console.log("  task:", t.name));
  projects.forEach((p) => console.log("  project:", p.name));
  users.forEach((u) => console.log("  user:", u.name, u.email));

  if (taskIds.length === 0 && projectIds.length === 0 && userIds.length === 0) {
    console.log("Nothing to clean up.");
    return;
  }

  // Order matters: clear RESTRICT-guarded references before deleting the rows they point to.
  await prisma.timesheetEntry.deleteMany({ where: { taskId: { in: taskIds } } });
  await prisma.auditLog.deleteMany({ where: { entityType: "Task", entityId: { in: taskIds } } });
  await prisma.auditLog.deleteMany({ where: { changedById: { in: userIds } } });

  const deletedTasks = await prisma.task.deleteMany({ where: { id: { in: taskIds } } });
  const deletedProjects = await prisma.project.deleteMany({ where: { id: { in: projectIds } } });
  const deletedUsers = await prisma.user.deleteMany({ where: { id: { in: userIds } } });

  console.log(`Deleted ${deletedTasks.count} tasks, ${deletedProjects.count} projects, ${deletedUsers.count} users.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
