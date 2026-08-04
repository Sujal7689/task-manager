export type Role = "ADMIN" | "MANAGER" | "TEAM_LEAD" | "STAFF";

export interface User {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  role: Role;
  departmentId?: string | null;
  companyId?: string | null;
  reportingManagerId?: string | null;
  status: "ACTIVE" | "INACTIVE";
  dateJoined: string;
  isZohoFallbackAssignee?: boolean;
}

export interface Company {
  id: string;
  name: string;
}

export interface Department {
  id: string;
  name: string;
  companyId: string;
}

export interface Category {
  id: string;
  name: string;
  parentId?: string | null;
  subCategories?: Category[];
}

export type ProjectStatus = "PLANNING" | "ACTIVE" | "ON_HOLD" | "COMPLETED";

export interface Project {
  id: string;
  name: string;
  companyId: string;
  departmentId: string;
  startDate?: string | null;
  endDate?: string | null;
  ownerId: string;
  owner?: { id: string; name: string };
  status: ProjectStatus;
}

export type MilestoneStatus = "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED" | "DELAYED";

export interface Milestone {
  id: string;
  name: string;
  projectId: string;
  targetDate?: string | null;
  ownerId: string;
  owner?: { id: string; name: string };
  status: MilestoneStatus;
  computedProgress?: number;
}

export type Priority = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type TaskStatus = "NOT_STARTED" | "IN_PROGRESS" | "ON_HOLD" | "UNDER_REVIEW" | "COMPLETED" | "CANCELLED";

export interface Task {
  id: string;
  taskNumber: string;
  name: string;
  description?: string | null;
  projectId?: string | null;
  project?: { id: string; name: string } | null;
  milestoneId?: string | null;
  milestone?: { id: string; name: string } | null;
  parentTaskId?: string | null;
  parentTask?: { id: string; taskNumber: string; name: string } | null;
  subTasks?: {
    id: string;
    taskNumber: string;
    name: string;
    status: TaskStatus;
    assignees: { userId: string; user: { id: string; name: string } }[];
  }[];
  attachments?: { id: string; fileName: string; filePath: string; fileSize: number; uploadedAt: string }[];
  categoryId?: string | null;
  subCategoryId?: string | null;
  priority: Priority;
  tags: string[];
  startDate?: string | null;
  dueDate?: string | null;
  estimatedHours?: number | null;
  isRecurring: boolean;
  recurringFrequency?: "DAILY" | "WEEKLY" | "MONTHLY" | null;
  companyId?: string | null;
  departmentId?: string | null;
  department?: { id: string; name: string } | null;
  assignedById: string;
  assignedBy?: { id: string; name: string };
  assignees: { userId: string; user: { id: string; name: string; email: string } }[];
  partyName?: string | null;
  refId?: string | null;
  status: TaskStatus;
  percentComplete: number;
  source: "INTERNAL" | "ZOHO_CRM";
  createdAt: string;
  updatedAt: string;
}
