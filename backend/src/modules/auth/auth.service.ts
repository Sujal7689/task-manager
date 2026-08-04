import bcrypt from "bcryptjs";
import crypto from "crypto";
import { prisma } from "../../config/prisma";
import { env } from "../../config/env";
import { AppError } from "../../utils/appError";
import { signToken } from "../../utils/jwt";
import { sendEmail } from "../../utils/mailer";

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

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour, single-use

function hashResetToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

// Always behaves the same whether or not the email is registered — the
// caller (controller) returns one generic message either way, so this
// can't be used to enumerate which emails have accounts.
export async function requestPasswordReset(email: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || user.status !== "ACTIVE") return;

  const token = crypto.randomBytes(32).toString("hex");
  await prisma.passwordResetToken.create({
    data: { userId: user.id, tokenHash: hashResetToken(token), expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS) },
  });

  const resetUrl = `${env.corsOrigin}/reset-password?token=${token}`;
  await sendEmail(
    user.email,
    "Reset your password",
    `Click the link below to set a new password. This link expires in 1 hour and can only be used once.\n\n${resetUrl}\n\nIf you didn't request this, you can safely ignore this email.`,
  );
}

export async function resetPassword(token: string, newPassword: string) {
  const record = await prisma.passwordResetToken.findUnique({ where: { tokenHash: hashResetToken(token) } });
  if (!record || record.usedAt || record.expiresAt < new Date()) {
    throw new AppError(400, "This password reset link is invalid or has expired");
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await prisma.$transaction([
    prisma.user.update({ where: { id: record.userId }, data: { passwordHash } }),
    prisma.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
  ]);
}
