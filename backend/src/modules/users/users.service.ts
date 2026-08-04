import bcrypt from "bcryptjs";
import { Role, UserStatus } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { AppError } from "../../utils/appError";
import { withFriendlyDeleteError } from "../../utils/prismaErrors";

const publicSelect = {
  id: true,
  name: true,
  email: true,
  phone: true,
  role: true,
  departmentId: true,
  companyId: true,
  reportingManagerId: true,
  status: true,
  dateJoined: true,
  isZohoFallbackAssignee: true,
} as const;

export async function listUsers() {
  return prisma.user.findMany({ select: publicSelect, orderBy: { name: "asc" } });
}

export async function getUser(id: string) {
  const user = await prisma.user.findUnique({ where: { id }, select: publicSelect });
  if (!user) throw new AppError(404, "User not found");
  return user;
}

export interface CreateUserInput {
  name: string;
  email: string;
  password: string;
  phone?: string;
  role: Role;
  departmentId?: string;
  companyId?: string;
  reportingManagerId?: string;
  isZohoFallbackAssignee?: boolean;
}

export async function createUser(input: CreateUserInput) {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) throw new AppError(409, "A user with this email already exists");

  const passwordHash = await bcrypt.hash(input.password, 10);
  return prisma.user.create({
    data: {
      name: input.name,
      email: input.email,
      passwordHash,
      phone: input.phone,
      role: input.role,
      departmentId: input.departmentId,
      companyId: input.companyId,
      reportingManagerId: input.reportingManagerId,
      isZohoFallbackAssignee: input.isZohoFallbackAssignee ?? false,
    },
    select: publicSelect,
  });
}

export interface UpdateUserInput {
  name?: string;
  email?: string;
  password?: string;
  phone?: string;
  role?: Role;
  departmentId?: string | null;
  companyId?: string | null;
  reportingManagerId?: string | null;
  status?: UserStatus;
  isZohoFallbackAssignee?: boolean;
}

export async function updateUser(id: string, input: UpdateUserInput) {
  await getUser(id);

  if (input.email) {
    const existing = await prisma.user.findUnique({ where: { email: input.email } });
    if (existing && existing.id !== id) throw new AppError(409, "A user with this email already exists");
  }

  const { password, ...rest } = input;
  return prisma.user.update({
    where: { id },
    data: { ...rest, passwordHash: password ? await bcrypt.hash(password, 10) : undefined },
    select: publicSelect,
  });
}

// Hard delete. Most content (assigned tasks, owned projects/milestones, audit
// log entries) references a User with an ON DELETE RESTRICT foreign key, so
// this fails with a friendly 409 for anyone who's actually done anything —
// deactivating (status: INACTIVE, via updateUser) is the safe default for
// those; delete is really only clean for a user created by mistake.
export async function deleteUser(id: string, requestingUserId: string) {
  if (id === requestingUserId) throw new AppError(400, "You can't delete your own account");
  await getUser(id);
  await withFriendlyDeleteError(() => prisma.user.delete({ where: { id } }), "user");
}

// Direct reports of a Team Lead, per Reporting-Manager-based team scoping (Phase 1 decision).
export async function getDirectReportIds(managerId: string): Promise<string[]> {
  const reports = await prisma.user.findMany({ where: { reportingManagerId: managerId }, select: { id: true } });
  return reports.map((r) => r.id);
}
