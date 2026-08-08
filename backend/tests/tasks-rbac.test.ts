import { beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "../src/app";
import { prisma } from "../src/config/prisma";
import { authed, loginAs, uniqueSuffix } from "./helpers";

// Exercises the Section 4 role-scoping rules end-to-end against the real DB:
// Admin sees everything, Staff sees only tasks assigned to them, and a Staff
// member cannot fully edit a task (only status/% via the progress endpoint).
describe("task RBAC scoping", () => {
  let adminToken: string;
  let staffToken: string;
  let projectId: string;
  let visibleTaskId: string;
  let hiddenTaskId: string;

  beforeAll(async () => {
    adminToken = await loginAs("admin@example.com");
    staffToken = await loginAs("staff@example.com");

    // Look up the seeded project by name rather than trusting array order —
    // other tests/manual runs may have created additional projects, and not
    // every project is guaranteed to have a milestone.
    const projectsRes = await request(app).get("/api/projects").set(authed(adminToken));
    const seedProject = projectsRes.body.find((p: { name: string }) => p.name === "Website Revamp");
    projectId = seedProject.id;
    const departmentId = seedProject.departmentId;

    const milestonesRes = await request(app).get("/api/milestones").query({ projectId }).set(authed(adminToken));
    const milestoneId = milestonesRes.body[0].id;

    const usersRes = await request(app).get("/api/users").set(authed(adminToken));
    const staffUser = usersRes.body.find((u: { email: string }) => u.email === "staff@example.com");

    const suffix = uniqueSuffix();

    const visible = await request(app)
      .post("/api/tasks")
      .set(authed(adminToken))
      .send({ name: `RBAC visible ${suffix}`, projectId, milestoneId, departmentId, assigneeIds: [staffUser.id] });
    visibleTaskId = visible.body.id;

    const hidden = await request(app)
      .post("/api/tasks")
      .set(authed(adminToken))
      .send({ name: `RBAC hidden ${suffix}`, projectId, milestoneId, departmentId });
    hiddenTaskId = hidden.body.id;
  });

  it("lets Staff see a task assigned to them", async () => {
    const res = await request(app).get(`/api/tasks/${visibleTaskId}`).set(authed(staffToken));
    expect(res.status).toBe(200);
  });

  it("blocks Staff from seeing a task not assigned to them", async () => {
    const res = await request(app).get(`/api/tasks/${hiddenTaskId}`).set(authed(staffToken));
    expect(res.status).toBe(403);
  });

  it("excludes the hidden task from Staff's task list", async () => {
    const res = await request(app).get("/api/tasks").set(authed(staffToken));
    const ids = res.body.map((t: { id: string }) => t.id);
    expect(ids).toContain(visibleTaskId);
    expect(ids).not.toContain(hiddenTaskId);
  });

  it("lets Admin see both tasks", async () => {
    const res = await request(app).get("/api/tasks").set(authed(adminToken));
    const ids = res.body.map((t: { id: string }) => t.id);
    expect(ids).toContain(visibleTaskId);
    expect(ids).toContain(hiddenTaskId);
  });

  it("lets Staff update status/percent via the progress endpoint", async () => {
    const res = await request(app)
      .patch(`/api/tasks/${visibleTaskId}/progress`)
      .set(authed(staffToken))
      .send({ status: "IN_PROGRESS", percentComplete: 50 });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("IN_PROGRESS");
  });

  // All roles (including Staff) can now fully edit tasks they can see —
  // widened from the original Admin/Manager/Team-Lead-only rule.
  it("allows Staff a full task edit", async () => {
    const res = await request(app).patch(`/api/tasks/${visibleTaskId}`).set(authed(staffToken)).send({ name: "edited by staff" });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe("edited by staff");
  });

  it("blocks Staff from updating progress on a task not assigned to them", async () => {
    const res = await request(app)
      .patch(`/api/tasks/${hiddenTaskId}/progress`)
      .set(authed(staffToken))
      .send({ status: "COMPLETED" });
    expect(res.status).toBe(403);
  });

  // Regression test: Manager visibility must not depend on Task.departmentId being
  // set directly — the Task form never sets it, only the Project always has one.
  // Manager scoping has to fall back to the task's Project.departmentId, or a
  // Manager sees zero of their department's tasks.
  it("lets Manager see a task whose department only comes from its Project", async () => {
    const managerToken = await loginAs("manager@example.com");
    const managerProfile = await request(app).get("/api/auth/me").set(authed(managerToken));

    // Create a project in the Manager's own department (not reusing the shared
    // `projectId` from other tests — the live DB may have projects in other
    // departments by the time this runs).
    const project = await request(app)
      .post("/api/projects")
      .set(authed(adminToken))
      .send({
        name: `Manager scoping project ${uniqueSuffix()}`,
        companyId: managerProfile.body.companyId,
        departmentId: managerProfile.body.departmentId,
        ownerId: managerProfile.body.id,
      });

    // Task.departmentId is optional at the schema level (the API now requires
    // it on create, but existing rows from before that rule may still lack
    // it) — created directly via Prisma to simulate that legacy shape, since
    // the API itself no longer allows omitting it.
    const task = await prisma.task.create({
      data: {
        taskNumber: `TEST-${uniqueSuffix()}`,
        name: `Manager scoping task ${uniqueSuffix()}`,
        projectId: project.body.id,
        assignedById: managerProfile.body.id,
      },
    });

    const res = await request(app).get(`/api/tasks/${task.id}`).set(authed(managerToken));
    expect(res.status).toBe(200);
  });
});
