import { NotificationType } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { AppError } from "../../utils/appError";
import { sendEmail } from "../../utils/mailer";

export interface NotifyInput {
  recipientId: string;
  type: NotificationType;
  message: string;
  taskId?: string;
  milestoneId?: string;
  sendEmailToo?: boolean;
}

// Section 6.9: every trigger writes to the Notification Log (in-app); some also fan out to email.
export async function notify(input: NotifyInput) {
  const notification = await prisma.notificationLog.create({
    data: {
      recipientId: input.recipientId,
      type: input.type,
      message: input.message,
      taskId: input.taskId,
      milestoneId: input.milestoneId,
    },
  });

  if (input.sendEmailToo) {
    const recipient = await prisma.user.findUnique({ where: { id: input.recipientId }, select: { email: true } });
    if (recipient) {
      await sendEmail(recipient.email, "Task Management notification", input.message);
      await prisma.notificationLog.update({ where: { id: notification.id }, data: { emailSent: true } });
    }
  }

  return notification;
}

// Prevents the hourly cron from re-firing the same alert on every tick.
export async function alreadyNotified(type: NotificationType, opts: { taskId?: string; milestoneId?: string; recipientId?: string }) {
  const existing = await prisma.notificationLog.findFirst({
    where: { type, taskId: opts.taskId, milestoneId: opts.milestoneId, recipientId: opts.recipientId },
  });
  return Boolean(existing);
}

export async function listForUser(userId: string) {
  return prisma.notificationLog.findMany({ where: { recipientId: userId }, orderBy: { sentOn: "desc" }, take: 100 });
}

export async function unreadCount(userId: string) {
  return prisma.notificationLog.count({ where: { recipientId: userId, readStatus: false } });
}

export async function markRead(id: string, userId: string) {
  const notification = await prisma.notificationLog.findUnique({ where: { id } });
  if (!notification || notification.recipientId !== userId) throw new AppError(404, "Notification not found");
  return prisma.notificationLog.update({ where: { id }, data: { readStatus: true } });
}

export async function markAllRead(userId: string) {
  await prisma.notificationLog.updateMany({ where: { recipientId: userId, readStatus: false }, data: { readStatus: true } });
}
