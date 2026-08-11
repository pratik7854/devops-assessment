require("dotenv").config({ quiet: true });

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const jwt = require("jsonwebtoken");
const { Pool } = require("pg");
const pino = require("pino");
const pinoHttp = require("pino-http");

const app = express();

const logger = pino({
  level: process.env.LOG_LEVEL || "info",
});

const requiredEnv = [
  "DB_HOST",
  "DB_USER",
  "DB_PASSWORD",
  "DB_NAME",
  "JWT_SECRET",
];

for (const name of requiredEnv) {
  if (!process.env[name]) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
}

const pool = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT) || 5432,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  max: Number(process.env.DB_POOL_MAX) || 10,
  idleTimeoutMillis: Number(process.env.DB_IDLE_TIMEOUT_MS) || 30000,
  connectionTimeoutMillis:
    Number(process.env.DB_CONNECTION_TIMEOUT_MS) || 5000,
});

pool.on("error", (err) => {
  logger.error({ err }, "Unexpected PostgreSQL pool error");
});

app.use(helmet());

app.use(
  cors({
    origin: process.env.CORS_ORIGIN
      ? process.env.CORS_ORIGIN.split(",").map((origin) => origin.trim())
      : false,
  })
);

app.use(express.json({ limit: "100kb" }));

app.use(
  pinoHttp({
    logger,
  })
);

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    error: "Too many login attempts. Please try again later.",
  },
});

function validatePing(req, res, next) {
  const { vehicleId, lat, lng, speed, timestamp } = req.body;

  if (!vehicleId || typeof vehicleId !== "string") {
    return res.status(400).json({
      error: "vehicleId is required",
    });
  }

  if (typeof lat !== "number" || lat < -90 || lat > 90) {
    return res.status(400).json({
      error: "lat must be a number between -90 and 90",
    });
  }

  if (typeof lng !== "number" || lng < -180 || lng > 180) {
    return res.status(400).json({
      error: "lng must be a number between -180 and 180",
    });
  }

  if (
    speed !== undefined &&
    (typeof speed !== "number" || speed < 0)
  ) {
    return res.status(400).json({
      error: "speed must be a non-negative number",
    });
  }

  if (
    timestamp !== undefined &&
    Number.isNaN(Date.parse(timestamp))
  ) {
    return res.status(400).json({
      error: "timestamp must be a valid date",
    });
  }

  next();
}

function authenticateToken(req, res, next) {
  const authorization = req.headers.authorization;

  if (!authorization || !authorization.startsWith("Bearer ")) {
    return res.status(401).json({
      error: "Authentication required",
    });
  }

  const token = authorization.substring("Bearer ".length);

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch (err) {
    return res.status(401).json({
      error: "Invalid or expired token",
    });
  }
}

app.get("/", (req, res) => {
  res.json({
    service: "VexarDrive Fleet Ping Service",
    status: "running",
  });
});

app.get("/health", (req, res) => {
  res.status(200).json({
    status: "healthy",
  });
});

app.get("/ready", async (req, res) => {
  try {
    await pool.query("SELECT 1");

    res.status(200).json({
      status: "ready",
      database: "ok",
    });
  } catch (err) {
    req.log.error({ err }, "Readiness check failed");

    res.status(503).json({
      status: "not_ready",
      database: "unavailable",
    });
  }
});

app.post("/api/fleet/ping", validatePing, async (req, res) => {
  const { vehicleId, lat, lng, speed, timestamp } = req.body;

  try {
    await pool.query(
      `INSERT INTO fleet_pings
       (vehicle_id, lat, lng, speed, ts)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        vehicleId,
        lat,
        lng,
        speed ?? null,
        timestamp ?? null,
      ]
    );

    res.status(201).json({
      status: "ok",
    });
  } catch (err) {
    req.log.error({ err }, "Failed to insert fleet ping");

    res.status(500).json({
      error: "insert failed",
    });
  }
});

app.post("/api/auth/login", loginLimiter, async (req, res) => {
  const { phone, otp } = req.body;

  if (!phone || !otp) {
    return res.status(400).json({
      error: "phone and otp are required",
    });
  }

  try {
    const result = await pool.query(
      "SELECT id, phone, name FROM drivers WHERE phone = $1",
      [phone]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        error: "Invalid credentials",
      });
    }

    const token = jwt.sign(
      {
        driverId: result.rows[0].id,
        role: "driver",
      },
      process.env.JWT_SECRET,
      {
        expiresIn: process.env.JWT_EXPIRES_IN || "1h",
      }
    );

    res.json({
      token,
    });
  } catch (err) {
    req.log.error({ err }, "Login failed");

    res.status(500).json({
      error: "login failed",
    });
  }
});

app.get(
  "/api/admin/drivers",
  authenticateToken,
  async (req, res) => {
    if (req.user.role !== "admin") {
      return res.status(403).json({
        error: "Admin access required",
      });
    }

    try {
      const result = await pool.query(
        "SELECT id, phone, name, created_at FROM drivers"
      );

      res.json(result.rows);
    } catch (err) {
      req.log.error({ err }, "Failed to retrieve drivers");

      res.status(500).json({
        error: "failed to retrieve drivers",
      });
    }
  }
);

app.use((err, req, res, next) => {
  req.log.error({ err }, "Unhandled application error");

  res.status(500).json({
    error: "Internal server error",
  });
});

module.exports = {
  app,
  pool,
  logger,
};