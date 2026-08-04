import cron from "node-cron";
import { prisma } from "../config/prisma";
import { env } from "../config/env";
import { alreadyNotified, notify } from "../modules/notifications/notifications.service";
import { topLevelTaskFilter } from "../modules/tasks/tasks.service";

const DAY_MS = 24 * 60 * 60 * 1000;

async function checkDueSoon() {
  const now = new Date();
  const in24h = new Date(now.getTime() + DAY_MS);
  const tasks = await prisma.task.findMany({
    where: {
      dueDate: { gte: now, lte: in24h },
      status: { notIn: ["COMPLETED", "CANCELLED"] },
    },
    include: { assignees: true },
  });

  for (const task of tasks) {
    for (const assignee of task.assignees) {
      if (await alreadyNotified("TASK_DUE_SOON", { taskId: task.id, recipientId: assignee.userId })) continue;
      await notify({
        recipientId: assignee.userId,
        type: "TASK_DUE_SOON",
        message: `${task.taskNumber} — ${task.name} is due within 24 hours`,
        taskId: task.id,
        sendEmailToo: true,
      });
    }
  }
}

async function findDepartmentHead(departmentId: string | null) {
  if (!departmentId) return null;
  return prisma.user.findFirst({ where: { departmentId, role: "MANAGER", status: "ACTIVE" } });
}

async function checkOverdue() {
  const now = new Date();
  const overdueTasks = await prisma.task.findMany({
    where: { dueDate: { lt: now }, status: { notIn: ["COMPLETED", "CANCELLED"] } },
    include: { assignees: true, project: { select: { departmentId: true } } },
  });

  for (const task of overdueTasks) {
    if (!task.dueDate) continue;
    const daysOverdue = Math.floor((now.getTime() - task.dueDate.getTime()) / DAY_MS);

    // Section 6.9 escalation ladder: Day1 -> Assigned To; Day3 -> +Assigned By; Day7 -> +Department Head.
    if (daysOverdue >= 1) {
      for (const assignee of task.assignees) {
        if (await alreadyNotified("TASK_OVERDUE_DAY1", { taskId: task.id, recipientId: assignee.userId })) continue;
        await notify({
          recipientId: assignee.userId,
          type: "TASK_OVERDUE_DAY1",
          message: `${task.taskNumber} — ${task.name} is overdue`,
          taskId: task.id,
          sendEmailToo: true,
        });
      }
    }

    if (daysOverdue >= 3) {
      if (!(await alreadyNotified("TASK_OVERDUE_DAY3", { taskId: task.id, recipientId: task.assignedById }))) {
        await notify({
          recipientId: task.assignedById,
          type: "TASK_OVERDUE_DAY3",
          message: `${task.taskNumber} — ${task.name} is now 3+ days overdue`,
          taskId: task.id,
          sendEmailToo: true,
        });
      }
    }

    if (daysOverdue >= 7) {
      // Task.departmentId is rarely set directly — fall back to the Project's department.
      const head = await findDepartmentHead(task.departmentId ?? task.project?.departmentId ?? null);
      if (head && !(await alreadyNotified("TASK_OVERDUE_DAY7", { taskId: task.id, recipientId: head.id }))) {
        await notify({
          recipientId: head.id,
          type: "TASK_OVERDUE_DAY7",
          message: `${task.taskNumber} — ${task.name} is now 7+ days overdue and needs attention`,
          taskId: task.id,
          sendEmailToo: true,
        });
      }
    }
  }
}

async function checkMilestonesAtRisk() {
  const milestones = await prisma.milestone.findMany({
    where: { status: { notIn: ["COMPLETED"] }, targetDate: { not: null } },
    include: { project: true, tasks: { where: topLevelTaskFilter, select: { percentComplete: true } } },
  });

  const now = Date.now();
  for (const milestone of milestones) {
    if (!milestone.targetDate) continue;
    const start = milestone.project.startDate?.getTime() ?? milestone.createdAt.getTime();
    const target = milestone.targetDate.getTime();
    if (target <= start) continue;

    const elapsedRatio = (now - start) / (target - start);
    if (elapsedRatio <= 0.5) continue;

    const avgCompletion =
      milestone.tasks.length === 0 ? 0 : milestone.tasks.reduce((sum, t) => sum + t.percentComplete, 0) / milestone.tasks.length;
    if (avgCompletion >= 50) continue;

    if (await alreadyNotified("MILESTONE_AT_RISK", { milestoneId: milestone.id, recipientId: milestone.ownerId })) continue;

    await notify({
      recipientId: milestone.ownerId,
      type: "MILESTONE_AT_RISK",
      message: `Milestone "${milestone.name}" is past 50% of its timeline with only ${Math.round(avgCompletion)}% task completion`,
      milestoneId: milestone.id,
      sendEmailToo: true,
    });
  }
}

async function runEscalationChecks() {
  try {
    await checkDueSoon();
    await checkOverdue();
    await checkMilestonesAtRisk();
  } catch (err) {
    console.error("[escalationCron] run failed:", err);
  }
}

export function startEscalationCron() {
  cron.schedule(env.notificationCronSchedule, runEscalationChecks);
  console.log(`[escalationCron] scheduled with "${env.notificationCronSchedule}"`);
}

export { runEscalationChecks };
