import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import helmet from "helmet";
import connectDB from "./config/db.js";
import bookingRouter from "./routes/bookingRoutes.js";
import walletRouter from "./routes/walletRoutes.js";
import authRouter from "./routes/authRoutes.js";
import adminRouter from "./routes/adminRoutes.js";
import { requestAudit } from "./middleware/requestAudit.js";
import eventRouter from "./routes/eventRoutes.js";

export function createApp({ auditPool = connectDB } = {}) {
  const app = express();
  const allowedOrigins = (process.env.CORS_ORIGINS || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.use(helmet());
  app.use(cors({
    origin(origin, callback) {
      const allowDevelopmentOrigin = process.env.NODE_ENV !== "production" && allowedOrigins.length === 0;
      if (!origin || allowDevelopmentOrigin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error("Origin is not allowed by CORS"));
    }
  }));
  app.use(requestAudit(auditPool));
  app.use(bodyParser.json({ limit: "32kb" }));

  app.get("/", (_request, response) => {
    response.json({ service: "ticket-booking", status: "ok" });
  });

  app.use("/auth", authRouter);
  app.use("/events", eventRouter);
  app.use("/bookings", bookingRouter);
  app.use("/wallets", walletRouter);
  app.use("/admin", adminRouter);

  return app;
}
