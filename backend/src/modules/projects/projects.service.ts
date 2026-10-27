import { Prisma, ProjectStatus, ProjectType } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { AppError } from "../../utils/appError";

// Every client project walks the same deal flow, in this order.
export const CLIENT_STAGES = [
  "New Sourcing Request",
  "Quotation",
  "Approval",
  "Advance Payment",
  "Production (Process)",
  "Production (Done)",
  "QC",
  "Shipping",
  "Documentation",
  "Final Payment",
  "Delivery",
  "Feedback",
];

export async function listProjects(options?: { skip: number; take: number; search?: string }) {
  const where: Prisma.ProjectWhereInput = options?.search
    ? { name: { contains: options.search, mode: "insensitive" } }
    : {};
  const include = {
    company: true,
    department: true,
    owner: { select: { id: true, name: true } },
    // Lets the list show a client project's current stage without a second call.
    milestones: { select: { id: true, name: true, status: true, sortOrder: true }, orderBy: { sortOrder: "asc" as const } },
  };
  const orderBy = { createdAt: "desc" as const };

  if (!options) {
    return prisma.project.findMany({ where, include, orderBy });
  }
  const [items, total] = await Promise.all([
    prisma.project.findMany({ where, include, orderBy, skip: options.skip, take: options.take }),
    prisma.project.count({ where }),
  ]);
  return { items, total };
}

export async function getProject(id: string) {
  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      company: true,
      department: true,
      owner: { select: { id: true, name: true } },
      // Client stages carry their activity logs (with attachments) so the
      // project page can show the whole deal in one view.
      milestones: {
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        include: {
          completedBy: { select: { id: true, name: true } },
          dailyActivities: {
            include: { loggedBy: { select: { id: true, name: true } }, attachments: true },
            orderBy: { activityDate: "desc" },
          },
        },
      },
      // Milestone is optional on tasks — top-level tasks that belong to this
      // project but weren't put under any milestone would otherwise be
      // invisible from the project page (which only ever rendered tasks
      // nested under a milestone).
      tasks: {
        where: { milestoneId: null, parentTaskId: null },
        select: {
          id: true,
          taskNumber: true,
          name: true,
          status: true,
          percentComplete: true,
          assignees: { include: { user: { select: { id: true, name: true } } } },
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });
  if (!project) throw new AppError(404, "Project not found");
  return project;
}

export interface CreateProjectInput {
  name: string;
  companyId: string;
  departmentId: string;
  startDate?: string;
  endDate?: string;
  ownerId: string;
  status?: ProjectStatus;
  type?: ProjectType;
}

export const createProject = (input: CreateProjectInput) =>
  prisma.project.create({
    data: {
      type: input.type,
      milestones:
        input.type === ProjectType.CLIENT
          ? { create: CLIENT_STAGES.map((name, i) => ({ name, sortOrder: i, ownerId: input.ownerId })) }
          : undefined,
      name: input.name,
      companyId: input.companyId,
      departmentId: input.departmentId,
      startDate: input.startDate ? new Date(input.startDate) : undefined,
      endDate: input.endDate ? new Date(input.endDate) : undefined,
      ownerId: input.ownerId,
      status: input.status,
    },
  });

export async function updateProject(id: string, input: Partial<CreateProjectInput>) {
  await getProject(id);
  // Type is fixed at creation: switching would leave stages/tasks inconsistent.
  const { type: _type, ...rest } = input;
  return prisma.project.update({
    where: { id },
    data: {
      ...rest,
      startDate: input.startDate ? new Date(input.startDate) : undefined,
      endDate: input.endDate ? new Date(input.endDate) : undefined,
    },
  });
}

export async function deleteProject(id: string) {
  await getProject(id);
  await prisma.project.delete({ where: { id } });
}

// Client projects: the project owner (or an Admin) can mark the deal lost, or
// reopen it back to ACTIVE.
export async function setLostDeal(id: string, lost: boolean, user: { id: string; role: string }) {
  const project = await prisma.project.findUnique({ where: { id }, select: { ownerId: true, type: true } });
  if (!project) throw new AppError(404, "Project not found");
  if (project.type !== ProjectType.CLIENT) throw new AppError(400, "Only client projects can be marked as a lost deal");
  if (user.role !== "ADMIN" && user.id !== project.ownerId) {
    throw new AppError(403, "Only the project owner or an Admin can change the deal status");
  }
  return prisma.project.update({ where: { id }, data: { status: lost ? ProjectStatus.LOST : ProjectStatus.ACTIVE } });
}
