import { Router } from "express";
import {
  auditLogsController,
  bookingMetricsController,
  databaseLocksController,
  operationsHealthController,
  recentBookingsController,
  usersController
} from "../controllers/adminController.js";
import { authenticate, requireAdmin } from "../middleware/authenticate.js";

const adminRouter = Router();

adminRouter.use(authenticate, requireAdmin);
adminRouter.get("/health", operationsHealthController);
adminRouter.get("/locks", databaseLocksController);
adminRouter.get("/metrics/bookings", bookingMetricsController);
adminRouter.get("/audit-logs", auditLogsController);
adminRouter.get("/bookings", recentBookingsController);
adminRouter.get("/users", usersController);

export default adminRouter;