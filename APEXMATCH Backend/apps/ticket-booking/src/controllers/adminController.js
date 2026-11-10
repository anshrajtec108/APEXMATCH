import connectDB from "../config/db.js";
import {
  getBookingMetrics,
  getDatabaseLocks,
  getRecentAudit,
  getRecentBookings,
  getUsers
} from "../services/adminService.js";

function queryInteger(value, fallback, minimum, maximum) {
  if (value === undefined) return fallback;
  if (!/^\d+$/.test(value)) return null;
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= minimum && number <= maximum ? number : null;
}

export async function bookingMetricsController(request, response) {
  const windowMinutes = queryInteger(request.query.minutes, 60, 1, 1440);
  if (windowMinutes === null) {
    return response.status(400).json({ error: "minutes must be an integer from 1 to 1440" });
  }
  try {
    return response.json({ data: await getBookingMetrics(connectDB, windowMinutes) });
  } catch (error) {
    return response.status(500).json({ error: "Unable to load booking metrics" });
  }
}

export async function auditLogsController(request, response) {
  const limit = queryInteger(request.query.limit, 100, 1, 500);
  const offset = queryInteger(request.query.offset, 0, 0, 1000000);
  if (limit === null || offset === null) {
    return response.status(400).json({ error: "limit or offset is outside the allowed range" });
  }
  try {
    return response.json({ data: await getRecentAudit(connectDB, { limit, offset }) });
  } catch (error) {
    return response.status(500).json({ error: "Unable to load audit logs" });
  }
}

export async function recentBookingsController(request, response) {
  const limit = queryInteger(request.query.limit, 100, 1, 500);
  if (limit === null) {
    return response.status(400).json({ error: "limit must be an integer from 1 to 500" });
  }
  try {
    return response.json({ data: await getRecentBookings(connectDB, limit) });
  } catch (error) {
    return response.status(500).json({ error: "Unable to load bookings" });
  }
}

export async function usersController(request, response) {
  const limit = queryInteger(request.query.limit, 100, 1, 500);
  if (limit === null) {
    return response.status(400).json({ error: "limit must be an integer from 1 to 500" });
  }
  try {
    return response.json({ data: await getUsers(connectDB, limit) });
  } catch (error) {
    return response.status(500).json({ error: "Unable to load users" });
  }
}

export async function operationsHealthController(_request, response) {
  const database = connectDB.query("SELECT 1").then(() => "ok").catch(() => "unavailable");
  const redis = process.env.REDIS_ENABLED === "true"
    ? import("../config/redis.js").then(async ({ default: redisClient }) => {
      try {
        await redisClient.ping();
        return "ok";
      } catch {
        return "unavailable";
      }
    })
    : Promise.resolve("disabled");
  const [databaseStatus, redisStatus] = await Promise.all([database, redis]);
  const status = databaseStatus === "ok" && redisStatus !== "unavailable" ? 200 : 503;
  return response.status(status).json({
    data: {
      status: status === 200 ? "healthy" : "degraded",
      uptimeSeconds: Math.floor(process.uptime()),
      database: databaseStatus,
      redis: redisStatus
    }
  });
}

export async function databaseLocksController(_request, response) {
  try {
    return response.json({ data: await getDatabaseLocks(connectDB) });
  } catch (error) {
    return response.status(500).json({ error: "Unable to load database lock state" });
  }
}