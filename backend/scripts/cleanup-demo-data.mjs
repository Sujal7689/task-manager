// One-off cleanup: removes the seed/demo dataset (prisma/seed.ts) entirely —
// the 4 demo login accounts, Acme Corp, its Operations department, the
// Website Revamp project, and its Phase 1 Launch milestone — leaving only
// real user-created data. Deletion order respects FK constraints: the
// project must go before its company/department (RESTRICT), users before
// nothing extra is needed since projects/milestones referencing them are
// already gone.
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const DEMO_EMAILS = ["admin@example.com", "manager@example.com", "teamlead@example.com", "staff@example.com"];

async function main() {
  const project = await prisma.project.findUnique({ where: { id: "seed-project" } });
  const company = await prisma.company.findUnique({ where: { id: "seed-company" } });
  const users = await prisma.user.findMany({ where: { email: { in: DEMO_EMAILS } } });

  console.log(`Found: project=${project?.name ?? "none"}, company=${company?.name ?? "none"}, ${users.length} demo users.`);

  if (project) {
    const deletedProject = await prisma.project.delete({ where: { id: project.id } }); // cascades its milestone(s)
    console.log("Deleted project:", deletedProject.name);
  }

  if (users.length > 0) {
    const deletedUsers = await prisma.user.deleteMany({ where: { email: { in: DEMO_EMAILS } } });
    console.log(`Deleted ${deletedUsers.count} demo users.`);
  }

  if (company) {
    const deletedCompany = await prisma.company.delete({ where: { id: company.id } }); // cascades its department(s)
    console.log("Deleted company:", deletedCompany.name);
  }

  console.log("Done.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
