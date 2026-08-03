import { prisma } from "../../config/prisma";
import { notify } from "../notifications/notifications.service";

export async function listComments(taskId: string) {
  return prisma.comment.findMany({
    where: { taskId },
    orderBy: { createdAt: "asc" },
  });
}

export interface CreateCommentInput {
  taskId: string;
  authorId: string;
  body: string;
  mentionedUserIds?: string[];
}

export async function createComment(input: CreateCommentInput) {
  const comment = await prisma.comment.create({
    data: {
      taskId: input.taskId,
      authorId: input.authorId,
      body: input.body,
      mentionedUserIds: input.mentionedUserIds ?? [],
    },
  });

  const task = await prisma.task.findUnique({ where: { id: input.taskId }, select: { taskNumber: true, name: true } });
  for (const userId of input.mentionedUserIds ?? []) {
    if (userId === input.authorId) continue;
    await notify({
      recipientId: userId,
      type: "MENTIONED",
      message: `You were mentioned in a comment on ${task?.taskNumber} — ${task?.name}`,
      taskId: input.taskId,
    });
  }

  return comment;
}
