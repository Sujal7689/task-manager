import { beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "../src/app";
import { authed, loginAs, uniqueSuffix } from "./helpers";

// Verifies the Section 6.5 KPI formula end-to-end: a task completed on time,
// on-estimate, with a top closure rating should score close to 100 on every
// sub-metric (and the overall weighted KPI score should reflect that).
describe("KPI calculation", () => {
  let adminToken: string;
  let userId: string;
  let userEmail: string;
  let projectId: string;
  let taskId: string;

  beforeAll(async () => {
    adminToken = await loginAs("admin@example.com");
    const suffix = uniqueSuffix();
    userEmail = `kpi-test-${suffix}@example.com`;

    const usersRes = await request(app).get("/api/users").set(authed(adminToken));
    const company = usersRes.body[0];

    const createUserRes = await request(app)
      .post("/api/users")
      .set(authed(adminToken))
      .send({ name: `KPI Test User ${suffix}`, email: userEmail, password: "Password123!", role: "STAFF", companyId: company.companyId, departmentId: company.departmentId });
    userId = createUserRes.body.id;

    // Look up the seeded project by name rather than trusting array order —
    // other tests/manual runs may have created additional projects, and not
    // every project is guaranteed to have a milestone.
    const projectsRes = await request(app).get("/api/projects").set(authed(adminToken));
    const seedProject = projectsRes.body.find((p: { name: string }) => p.name === "Website Revamp");
    projectId = seedProject.id;
    const departmentId = seedProject.departmentId;

    const milestonesRes = await request(app).get("/api/milestones").query({ projectId }).set(authed(adminToken));
    const milestoneId = milestonesRes.body[0].id;

    const dueDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const taskRes = await request(app)
      .post("/api/tasks")
      .set(authed(adminToken))
      .send({ name: `KPI task ${suffix}`, projectId, milestoneId, departmentId, assigneeIds: [userId], estimatedHours: 2, dueDate });
    taskId = taskRes.body.id;

    // Log exactly the estimated hours today, so estimate accuracy should be ~100.
    const today = new Date().toISOString().slice(0, 10);
    await request(app)
      .post("/api/activity-logs")
      .set(authed(adminToken))
      .send({
        taskId,
        activityType: "UPDATE",
        activityDate: today,
        timeIn: `${today}T09:00:00`,
        timeOut: `${today}T11:00:00`,
      });

    // Close the task (before the due date) with a top closure rating.
    await request(app).patch(`/api/tasks/${taskId}`).set(authed(adminToken)).send({ status: "COMPLETED", closureRating: 5 });
  });

  it("scores the on-time, on-estimate, top-rated task near 100 on every sub-metric", async () => {
    const res = await request(app).get("/api/reports/staff-performance").query({ userId, months: 1 }).set(authed(adminToken));
    expect(res.status).toBe(200);
    const currentMonth = res.body[res.body.length - 1];

    expect(currentMonth.totalClosed).toBe(1);
    expect(currentMonth.onTimePct).toBe(100);
    expect(currentMonth.estimateAccuracy).toBeGreaterThan(95);
    expect(currentMonth.qualityScore).toBe(100);
  });

  it("appears in the monthly leaderboard", async () => {
    const res = await request(app).get("/api/leaderboard").query({ period: "MONTHLY" }).set(authed(adminToken));
    const entry = res.body.find((r: { userId: string }) => r.userId === userId);
    expect(entry).toBeDefined();
    expect(entry.totalClosed).toBe(1);
  });
});
