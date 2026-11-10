import { Router } from "express";
import {
  addDemoFundsController,
  getWalletBalanceController
} from "../controllers/walletController.js";
import { authenticate } from "../middleware/authenticate.js";

const walletRouter = Router();

walletRouter.use(authenticate);
walletRouter.get("/me", getWalletBalanceController);
walletRouter.post("/me/demo-top-up", addDemoFundsController);

export default walletRouter;