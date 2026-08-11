const request = require("supertest");

const { app, pool } = require("../app");

describe("Fleet Ping API", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("should accept a valid fleet ping", async () => {
    jest.spyOn(pool, "query").mockResolvedValue({
      rows: [],
    });

    const response = await request(app)
      .post("/api/fleet/ping")
      .send({
        vehicleId: "VEH-001",
        lat: 20.2961,
        lng: 85.8245,
        speed: 45.5,
        timestamp: "2026-08-10T17:30:00Z",
      });

    expect(response.statusCode).toBe(201);

    expect(response.body).toEqual({
      status: "ok",
    });
  });

  test("should reject latitude outside valid range", async () => {
    const response = await request(app)
      .post("/api/fleet/ping")
      .send({
        vehicleId: "VEH-002",
        lat: 999,
        lng: 85.8245,
        speed: 45.5,
      });

    expect(response.statusCode).toBe(400);

    expect(response.body).toEqual({
      error: "lat must be a number between -90 and 90",
    });
  });

  test("should reject longitude outside valid range", async () => {
    const response = await request(app)
      .post("/api/fleet/ping")
      .send({
        vehicleId: "VEH-003",
        lat: 20.2961,
        lng: 999,
        speed: 45.5,
      });

    expect(response.statusCode).toBe(400);

    expect(response.body).toEqual({
      error: "lng must be a number between -180 and 180",
    });
  });

  test("should reject negative speed", async () => {
    const response = await request(app)
      .post("/api/fleet/ping")
      .send({
        vehicleId: "VEH-004",
        lat: 20.2961,
        lng: 85.8245,
        speed: -10,
      });

    expect(response.statusCode).toBe(400);

    expect(response.body).toEqual({
      error: "speed must be a non-negative number",
    });
  });

  test("should require vehicleId", async () => {
    const response = await request(app)
      .post("/api/fleet/ping")
      .send({
        lat: 20.2961,
        lng: 85.8245,
        speed: 45.5,
      });

    expect(response.statusCode).toBe(400);

    expect(response.body).toEqual({
      error: "vehicleId is required",
    });
  });
});