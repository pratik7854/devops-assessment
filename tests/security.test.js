const request = require("supertest");

const { app, pool } = require("../app");

describe("Security", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("Admin endpoint should require authentication", async () => {
    const response = await request(app)
      .get("/api/admin/drivers");

    expect(response.statusCode).toBe(401);

    expect(response.body).toEqual({
      error: "Authentication required",
    });
  });

  test("SQL injection attempt should not bypass authentication", async () => {
    jest.spyOn(pool, "query").mockResolvedValue({
      rows: [],
    });

    const response = await request(app)
      .post("/api/auth/login")
      .send({
        phone: "admin' OR '1'='1",
        otp: "123456",
      });

    expect(response.statusCode).toBe(401);

    expect(response.body).toEqual({
      error: "Invalid credentials",
    });
  });
});