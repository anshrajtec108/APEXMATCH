import dotenv from "dotenv";
import connectDB from "./config/db.js";
import redisClient from "./config/redis.js";
import { initializeDatabase } from "./db/initDatabase.js";
import { createApp } from "./server.js";
import { assertRuntimeConfiguration, provisionAdminUser } from "./services/authService.js";

async function startServer() {
  dotenv.config();
  assertRuntimeConfiguration();
  await initializeDatabase(connectDB);
  await provisionAdminUser(connectDB);
  if (process.env.REDIS_ENABLED === "true") {
    await redisClient.connect();
  }

  const app = createApp();
  const port = Number(process.env.PORT || 3000);
  app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
  });
}

startServer().catch((error) => {
  console.error("Error starting server:", error);
  process.exit(1);
});