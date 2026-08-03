import bcrypt from "bcryptjs";
import { PrismaClient, Role } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const company = await prisma.company.upsert({
    where: { id: "seed-company" },
    update: {},
    create: { id: "seed-company", name: "Acme Corp" },
  });

  const department = await prisma.department.upsert({
    where: { id: "seed-department" },
    update: {},
    create: { id: "seed-department", name: "Operations", companyId: company.id },
  });

  const passwordHash = await bcrypt.hash("Password123!", 10);

  const admin = await prisma.user.upsert({
    where: { email: "admin@example.com" },
    update: {},
    create: {
      name: "Ada Admin",
      email: "admin@example.com",
      passwordHash,
      role: Role.ADMIN,
      companyId: company.id,
      departmentId: department.id,
      isZohoFallbackAssignee: true,
    },
  });

  const manager = await prisma.user.upsert({
    where: { email: "manager@example.com" },
    update: {},
    create: {
      name: "Mia Manager",
      email: "manager@example.com",
      passwordHash,
      role: Role.MANAGER,
      companyId: company.id,
      departmentId: department.id,
      reportingManagerId: admin.id,
    },
  });

  const teamLead = await prisma.user.upsert({
    where: { email: "teamlead@example.com" },
    update: {},
    create: {
      name: "Tom TeamLead",
      email: "teamlead@example.com",
      passwordHash,
      role: Role.TEAM_LEAD,
      companyId: company.id,
      departmentId: department.id,
      reportingManagerId: manager.id,
    },
  });

  await prisma.user.upsert({
    where: { email: "staff@example.com" },
    update: {},
    create: {
      name: "Sam Staff",
      email: "staff@example.com",
      passwordHash,
      role: Role.STAFF,
      companyId: company.id,
      departmentId: department.id,
      reportingManagerId: teamLead.id,
    },
  });

  await prisma.category.upsert({
    where: { id: "seed-category" },
    update: {},
    create: { id: "seed-category", name: "General" },
  });

  const project = await prisma.project.upsert({
    where: { id: "seed-project" },
    update: {},
    create: {
      id: "seed-project",
      name: "Website Revamp",
      companyId: company.id,
      departmentId: department.id,
      ownerId: manager.id,
      status: "ACTIVE",
    },
  });

  await prisma.milestone.upsert({
    where: { id: "seed-milestone" },
    update: {},
    create: {
      id: "seed-milestone",
      name: "Phase 1 Launch",
      projectId: project.id,
      ownerId: teamLead.id,
      status: "IN_PROGRESS",
    },
  });

  console.log("Seed complete. Login with admin@example.com / Password123! (also manager@, teamlead@, staff@ — same password).");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
