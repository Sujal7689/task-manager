import { describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "../src/app";

describe("auth", () => {
  it("logs in a seeded user and returns a JWT", async () => {
    const res = await request(app).post("/api/auth/login").send({ email: "admin@example.com", password: "Password123!" });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTypeOf("string");
    expect(res.body.user.email).toBe("admin@example.com");
  });

  it("rejects wrong password", async () => {
    const res = await request(app).post("/api/auth/login").send({ email: "admin@example.com", password: "wrong" });
    expect(res.status).toBe(401);
  });

  it("rejects requests to protected routes without a token", async () => {
    const res = await request(app).get("/api/tasks");
    expect(res.status).toBe(401);
  });
});
