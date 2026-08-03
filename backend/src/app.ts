import express from "express";
import cors from "cors";
import path from "path";
import { env } from "./config/env";
import { errorHandler } from "./middleware/errorHandler";
import authRoutes from "./modules/auth/auth.routes";
import masterDataRoutes from "./modules/masterData/masterData.routes";
import userRoutes from "./modules/users/users.routes";
import projectRoutes from "./modules/projects/projects.routes";
import milestoneRoutes from "./modules/milestones/milestones.routes";
import taskRoutes from "./modules/tasks/tasks.routes";
import activityLogRoutes from "./modules/activityLogs/activityLogs.routes";
import timesheetRoutes from "./modules/timesheets/timesheets.routes";
import notificationRoutes from "./modules/notifications/notifications.routes";
import commentRoutes from "./modules/comments/comments.routes";
import dashboardRoutes from "./modules/dashboard/dashboard.routes";
import kpiRoutes from "./modules/kpi/kpi.routes";
import leaderboardRoutes from "./modules/leaderboard/leaderboard.routes";
import reportRoutes from "./modules/reports/reports.routes";
import zohoRoutes from "./modules/zoho/zoho.routes";
import auditLogRoutes from "./modules/auditLog/auditLog.routes";
import escalationRuleRoutes from "./modules/escalationRules/escalationRules.routes";
import leadershipRoutes from "./modules/leadership/leadership.routes";

export const app = express();

app.use(cors({ origin: env.corsOrigin, credentials: true }));
app.use(express.json());
app.use("/uploads", express.static(path.resolve(env.uploadDir)));

app.get("/api/health", (_req, res) => res.json({ status: "ok" }));

app.use("/api/auth", authRoutes);
app.use("/api", masterDataRoutes);
app.use("/api/users", userRoutes);
app.use("/api/projects", projectRoutes);
app.use("/api/milestones", milestoneRoutes);
app.use("/api/tasks", taskRoutes);
app.use("/api/activity-logs", activityLogRoutes);
app.use("/api/timesheets", timesheetRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/comments", commentRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/kpi", kpiRoutes);
app.use("/api/leaderboard", leaderboardRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/admin/zoho", zohoRoutes);
app.use("/api/admin/audit-log", auditLogRoutes);
app.use("/api/admin/escalation-rules", escalationRuleRoutes);
app.use("/api/leadership", leadershipRoutes);

app.use(errorHandler);
