import { beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "../src/app";
import { prisma } from "../src/config/prisma";
import { authed, loginAs } from "./helpers";

const here = { lat: 27.7172, lng: 85.324 };

describe("attendance requires location", () => {
  let token: string;

  beforeAll(async () => {
    token = await loginAs("staff@example.com");
    const staff = await prisma.user.findUniqueOrThrow({ where: { email: "staff@example.com" } });
    await prisma.attendance.deleteMany({ where: { userId: staff.id } });
  });

  it("rejects check-in with no location", async () => {
    const res = await request(app).post("/api/attendance/check-in").set(authed(token)).send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/location is required/i);
  });

  it("rejects check-in with impossible coordinates", async () => {
    const res = await request(app)
      .post("/api/attendance/check-in")
      .set(authed(token))
      .send({ location: { lat: 200, lng: 85 } });
    expect(res.status).toBe(400);
  });

  it("records coordinates on check-in and check-out, and requires them for check-out", async () => {
    const checkIn = await request(app).post("/api/attendance/check-in").set(authed(token)).send({ location: here });
    expect(checkIn.status).toBe(201);
    expect(checkIn.body.checkInLat).toBe(here.lat);
    expect(checkIn.body.checkInLng).toBe(here.lng);

    const noLoc = await request(app).post("/api/attendance/check-out").set(authed(token)).send({});
    expect(noLoc.status).toBe(400);

    const checkOut = await request(app).post("/api/attendance/check-out").set(authed(token)).send({ location: here });
    expect(checkOut.status).toBe(200);
    expect(checkOut.body.checkOutLat).toBe(here.lat);
    expect(checkOut.body.checkOutLng).toBe(here.lng);
  });
});
