import bcrypt from "bcryptjs";
import { prisma } from "../../config/prisma";
import { AppError } from "../../utils/appError";
import { signToken } from "../../utils/jwt";

export async function login(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || user.status !== "ACTIVE") {
    throw new AppError(401, "Invalid credentials");
  }
  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    throw new AppError(401, "Invalid credentials");
  }
  const token = signToken({
    sub: user.id,
    role: user.role,
    departmentId: user.departmentId,
    companyId: user.companyId,
  });
  const { passwordHash: _passwordHash, ...safeUser } = user;
  return { token, user: safeUser };
}

export async function getProfile(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
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
    },
  });
  if (!user) throw new AppError(404, "User not found");
  return user;
}
