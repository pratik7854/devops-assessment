const { app, pool, logger } = require("./app");

const PORT = Number(process.env.PORT) || 3000;

const server = app.listen(PORT, () => {
  logger.info(
    {
      port: PORT,
      environment: process.env.NODE_ENV || "development",
    },
    "Server started"
  );
});

async function shutdown(signal) {
  logger.info({ signal }, "Shutdown signal received");

  server.close(async () => {
    try {
      await pool.end();

      logger.info("Database pool closed");

      process.exit(0);
    } catch (err) {
      logger.error({ err }, "Error during shutdown");

      process.exit(1);
    }
  });

  setTimeout(() => {
    logger.error("Forced shutdown after timeout");

    process.exit(1);
  }, 10000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));