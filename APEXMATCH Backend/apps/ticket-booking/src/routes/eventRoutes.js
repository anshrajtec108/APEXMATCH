import { Router } from "express";
import { seatPriceController } from "../controllers/eventController.js";

const eventRouter = Router();

eventRouter.get("/:eventId/seats/:seatNumber", seatPriceController);

export default eventRouter;