import { Router } from "express";
import { createBookingController } from "../controllers/bookingController.js";
import { authenticate } from "../middleware/authenticate.js";

const bookingRouter = Router();

bookingRouter.post("/", authenticate, createBookingController);

export default bookingRouter;