// Scratch: creates a throwaway ADMIN account for API verification, since the
// original demo admin was deleted per the user's request and I don't have
// (and shouldn't ask for) real user passwords. Delete this account immediately
// after verification — see cleanup-test-data.mjs pattern.
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash("TempVerify123!", 10);
  const existing = await prisma.user.findUnique({ where: { email: "temp-verify@example.com" } });
  if (existing) {
    console.log("already exists:", existing.id);
    return;
  }
  const user = await prisma.user.create({
    data: { name: "Temp Verify Admin", email: "temp-verify@example.com", passwordHash, role: "ADMIN" },
  });
  console.log("created:", user.id);
}

main().finally(() => prisma.$disconnect());
