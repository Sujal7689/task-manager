import { LeaveType, Prisma, Role } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { AppError } from "../../utils/appError";
import { getDirectReportIds } from "../users/users.service";

interface AuthUser {
  id: string;
  role: Role;
  departmentId: string | null;
  companyId: string | null;
}

function toDateOnly(d: string | Date): Date {
  const parsed = new Date(d);
  return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()));
}

function todayDateOnly(): Date {
  return toDateOnly(new Date());
}

// Self-edit window: an employee may correct their own attendance/leave for
// today or yesterday only; anything older needs their reporting manager or
// an Admin. Managers/Admins editing someone else's record have no such limit.
function isWithinSelfEditWindow(date: Date): boolean {
  const today = todayDateOnly();
  const yesterday = new Date(today);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  return date.getTime() === today.getTime() || date.getTime() === yesterday.getTime();
}

// Visibility/edit authority for Attendance & Leave is deliberately narrower
// than closure ratings: only Admin (everyone) or a user's own direct
// reporting manager (one level, not the whole chain) — no blanket
// Manager/Team Lead exception.
export async function getVisibleAttendanceUserIds(user: AuthUser): Promise<string[] | undefined> {
  if (user.role === Role.ADMIN) return undefined;
  return [...(await getDirectReportIds(user.id)), user.id];
}

async function assertCanManageRecord(targetUserId: string, actingUser: AuthUser, recordDate: Date): Promise<void> {
  if (actingUser.role === Role.ADMIN) return;
  if (actingUser.id === targetUserId) {
    if (!isWithinSelfEditWindow(recordDate)) {
      throw new AppError(403, "You can only edit your own attendance/leave for today or yesterday — ask your reporting manager for older corrections");
    }
    return;
  }
  const target = await prisma.user.findUnique({ where: { id: targetUserId }, select: { reportingManagerId: true } });
  if (target?.reportingManagerId === actingUser.id) return;
  throw new AppError(403, "You can only manage attendance/leave for yourself or your direct reports");
}

// ==================== Attendance ====================

export async function checkIn(userId: string) {
  const date = todayDateOnly();
  const existing = await prisma.attendance.findUnique({ where: { userId_date: { userId, date } } });
  if (existing) throw new AppError(400, "Already checked in today");
  return prisma.attendance.create({ data: { userId, date, checkInAt: new Date() } });
}

export async function checkOut(userId: string) {
  const date = todayDateOnly();
  const existing = await prisma.attendance.findUnique({ where: { userId_date: { userId, date } } });
  if (!existing) throw new AppError(400, "You haven't checked in today");
  if (existing.checkOutAt) throw new AppError(400, "Already checked out today");
  return prisma.attendance.update({ where: { id: existing.id }, data: { checkOutAt: new Date() } });
}

export async function getTodayAttendance(userId: string) {
  return prisma.attendance.findUnique({ where: { userId_date: { userId, date: todayDateOnly() } } });
}

export interface UpdateAttendanceInput {
  checkInAt?: string;
  checkOutAt?: string | null;
}

export async function updateAttendance(id: string, input: UpdateAttendanceInput, actingUser: AuthUser) {
  const existing = await prisma.attendance.findUnique({ where: { id } });
  if (!existing) throw new AppError(404, "Attendance record not found");
  await assertCanManageRecord(existing.userId, actingUser, existing.date);

  return prisma.attendance.update({
    where: { id },
    data: {
      checkInAt: input.checkInAt ? new Date(input.checkInAt) : undefined,
      checkOutAt: input.checkOutAt === null ? null : input.checkOutAt ? new Date(input.checkOutAt) : undefined,
    },
  });
}

export async function getMyAttendance(userId: string, from: string, to: string) {
  return prisma.attendance.findMany({
    where: { userId, date: { gte: toDateOnly(from), lte: toDateOnly(to) } },
    orderBy: { date: "desc" },
  });
}

export async function getTeamAttendance(user: AuthUser, from: string, to: string) {
  const userIds = await getVisibleAttendanceUserIds(user);
  const where: Prisma.AttendanceWhereInput = {
    userId: userIds ? { in: userIds } : undefined,
    date: { gte: toDateOnly(from), lte: toDateOnly(to) },
  };
  return prisma.attendance.findMany({
    where,
    include: { user: { select: { id: true, name: true } } },
    orderBy: [{ date: "desc" }, { user: { name: "asc" } }],
  });
}

// ==================== Leave ====================

// Self-service create window: today through today+2 (inclusive) — only the
// leave's start date has to fall in this window, so a long leave can be
// logged as soon as its first day is close enough. A date beyond that
// "isn't enabled yet"; a date in the past is never allowed self-service.
// Admin is exempt entirely — they're the escape hatch for legitimate
// backdated leave (e.g. a sick day the employee couldn't log themselves).
function assertLeaveCreateDateAllowed(startDate: Date, actingUser: AuthUser): void {
  if (actingUser.role === Role.ADMIN) return;
  const today = todayDateOnly();
  const maxDate = new Date(today);
  maxDate.setUTCDate(maxDate.getUTCDate() + 2);
  if (startDate < today) throw new AppError(400, "You cannot log leave for a past date");
  if (startDate > maxDate) throw new AppError(400, "You can only log leave for today or up to 2 days in advance — check back closer to the date");
}

// Editing an existing leave entry is never self-service, regardless of
// date — only Admin or the employee's direct reporting manager.
async function assertCanEditLeave(targetUserId: string, actingUser: AuthUser): Promise<void> {
  if (actingUser.role === Role.ADMIN) return;
  const target = await prisma.user.findUnique({ where: { id: targetUserId }, select: { reportingManagerId: true } });
  if (target?.reportingManagerId === actingUser.id) return;
  throw new AppError(403, "Only an Admin or your reporting manager can edit a leave entry");
}

// Cancelling (deleting) is the one self-service action an employee keeps —
// but only while the leave is still upcoming. Once its start date arrives
// or passes, only Admin/reporting manager can remove it.
async function assertCanCancelLeave(targetUserId: string, actingUser: AuthUser, startDate: Date): Promise<void> {
  if (actingUser.role === Role.ADMIN) return;
  if (actingUser.id === targetUserId) {
    if (startDate > todayDateOnly()) return;
    throw new AppError(403, "You can only cancel an upcoming leave — ask your reporting manager to remove one that's already started");
  }
  const target = await prisma.user.findUnique({ where: { id: targetUserId }, select: { reportingManagerId: true } });
  if (target?.reportingManagerId === actingUser.id) return;
  throw new AppError(403, "You can only manage leave for yourself or your direct reports");
}

export interface CreateLeaveInput {
  leaveType: LeaveType;
  startDate: string;
  endDate: string;
  reason?: string;
  targetUserId?: string; // Admin-only: log leave on behalf of another employee
}

export async function createLeave(actingUser: AuthUser, input: CreateLeaveInput) {
  if (input.targetUserId && input.targetUserId !== actingUser.id && actingUser.role !== Role.ADMIN) {
    throw new AppError(403, "Only Admin can log leave on behalf of another employee");
  }
  const userId = input.targetUserId ?? actingUser.id;

  const startDate = toDateOnly(input.startDate);
  const endDate = toDateOnly(input.endDate);
  if (endDate < startDate) throw new AppError(400, "endDate must be on or after startDate");
  assertLeaveCreateDateAllowed(startDate, actingUser);

  return prisma.leave.create({ data: { userId, leaveType: input.leaveType, startDate, endDate, reason: input.reason } });
}

export interface UpdateLeaveInput {
  leaveType?: LeaveType;
  startDate?: string;
  endDate?: string;
  reason?: string | null;
}

export async function updateLeave(id: string, input: UpdateLeaveInput, actingUser: AuthUser) {
  const existing = await prisma.leave.findUnique({ where: { id } });
  if (!existing) throw new AppError(404, "Leave record not found");
  await assertCanEditLeave(existing.userId, actingUser);

  const startDate = input.startDate ? toDateOnly(input.startDate) : existing.startDate;
  const endDate = input.endDate ? toDateOnly(input.endDate) : existing.endDate;
  if (endDate < startDate) throw new AppError(400, "endDate must be on or after startDate");

  return prisma.leave.update({
    where: { id },
    data: { leaveType: input.leaveType, startDate, endDate, reason: input.reason === null ? null : input.reason },
  });
}

export async function deleteLeave(id: string, actingUser: AuthUser) {
  const existing = await prisma.leave.findUnique({ where: { id } });
  if (!existing) throw new AppError(404, "Leave record not found");
  await assertCanCancelLeave(existing.userId, actingUser, existing.startDate);
  await prisma.leave.delete({ where: { id } });
}

export async function getMyLeaves(userId: string, from: string, to: string) {
  return prisma.leave.findMany({
    where: { userId, startDate: { lte: toDateOnly(to) }, endDate: { gte: toDateOnly(from) } },
    orderBy: { startDate: "desc" },
  });
}

export async function getTeamLeaves(user: AuthUser, from: string, to: string) {
  const userIds = await getVisibleAttendanceUserIds(user);
  const where: Prisma.LeaveWhereInput = {
    userId: userIds ? { in: userIds } : undefined,
    startDate: { lte: toDateOnly(to) },
    endDate: { gte: toDateOnly(from) },
  };
  return prisma.leave.findMany({
    where,
    include: { user: { select: { id: true, name: true } } },
    orderBy: [{ startDate: "desc" }],
  });
}
