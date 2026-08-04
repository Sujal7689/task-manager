import { MilestoneStatus } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { AppError } from "../../utils/appError";

export const listMilestones = (projectId?: string) =>
  prisma.milestone.findMany({
    where: projectId ? { projectId } : undefined,
    include: { owner: { select: { id: true, name: true } } },
    orderBy: { targetDate: "asc" },
  });

export async function getMilestone(id: string) {
  // Sub-tasks are listed under their parent's Sub-tasks tab, not flattened
  // here too — this list is top-level tasks only.
  const milestone = await prisma.milestone.findUnique({
    where: { id },
    include: { owner: { select: { id: true, name: true } }, tasks: { where: { parentTaskId: null } }, project: true },
  });
  if (!milestone) throw new AppError(404, "Milestone not found");
  return milestone;
}

export interface CreateMilestoneInput {
  name: string;
  projectId: string;
  targetDate?: string;
  ownerId: string;
  status?: MilestoneStatus;
}

export const createMilestone = (input: CreateMilestoneInput) =>
  prisma.milestone.create({
    data: {
      name: input.name,
      projectId: input.projectId,
      targetDate: input.targetDate ? new Date(input.targetDate) : undefined,
      ownerId: input.ownerId,
      status: input.status,
    },
  });

export async function updateMilestone(id: string, input: Partial<CreateMilestoneInput>) {
  await getMilestone(id);
  return prisma.milestone.update({
    where: { id },
    data: { ...input, targetDate: input.targetDate ? new Date(input.targetDate) : undefined },
  });
}

export async function deleteMilestone(id: string) {
  await getMilestone(id);
  await prisma.milestone.delete({ where: { id } });
}

// Milestone progress auto-rolls up from child Task completion % (Section 6.1).
export async function getMilestoneProgress(id: string): Promise<number> {
  const tasks = await prisma.task.findMany({ where: { milestoneId: id, parentTaskId: null }, select: { percentComplete: true } });
  if (tasks.length === 0) return 0;
  const total = tasks.reduce((sum, t) => sum + t.percentComplete, 0);
  return Math.round(total / tasks.length);
}
