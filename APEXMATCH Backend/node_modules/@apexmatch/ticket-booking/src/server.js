import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import connectDB from "./config/db.js";
import { initializeDatabase } from "./db/initDatabase.js";
import { createBooking } from "./services/bookingService.js";
import redisClient from "./config/redis.js";

export function createApp() {
  const app = express();
  app.use(cors());
  app.use(bodyParser.json());

  app.get("/", (_request, response) => {
    response.json({ service: "ticket-booking", status: "ok" });
  });

  app.post("/bookings", async (request, response) => {
    try {
      const { userId, eventId, seatNumber } = request.body;
      if (!Number.isInteger(userId) || !Number.isInteger(eventId) || !seatNumber) {
        return response.status(400).json({ error: "userId, eventId, and seatNumber are required" });
      }

      const booking = await createBooking(connectDB, { userId, eventId, seatNumber });
      return response.status(201).json({ data: booking });
    } catch (error) {
      console.error("Booking failed:", error.message);
      return response.status(error.statusCode || 500).json({ error: error.message });
    }
  });

  return app;
}

async function startServer() {
  dotenv.config();
  await initializeDatabase(connectDB);
  await redisClient.connect();
  const app = createApp();
  const PORT = process.env.PORT || 3000;

  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
}

startServer().catch((error) => {
  console.error("Error starting server:", error);
  process.exit(1);
});