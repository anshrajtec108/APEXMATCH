import { Router } from "express";
import rateLimit from "express-rate-limit";
import { loginController, registerController } from "../controllers/authController.js";

const authRouter = Router();
const loginLimiter = rateLimit({
	windowMs: 15 * 60 * 1000,
	limit: 10,
	standardHeaders: true,
	legacyHeaders: false,
	message: { error: "Too many login attempts; try again later" }
});
const registrationLimiter = rateLimit({
	windowMs: 60 * 60 * 1000,
	limit: 5,
	standardHeaders: true,
	legacyHeaders: false,
	message: { error: "Too many registration attempts; try again later" }
});

authRouter.post("/register", registrationLimiter, registerController);
authRouter.post("/login", loginLimiter, loginController);

export default authRouter;