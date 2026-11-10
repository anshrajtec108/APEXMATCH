import connectDB from "../config/db.js";
import { addDemoFunds, getWalletBalance } from "../services/walletService.js";

function parsePositiveAmount(value) {
  const amount = typeof value === "number" ? String(value) : value;
  if (typeof amount !== "string" || !/^(?:0|[1-9]\d{0,7})(?:\.\d{1,2})?$/.test(amount)) {
    return null;
  }
  return Number(amount) > 0 ? amount : null;
}

export async function getWalletBalanceController(request, response) {
  try {
    const wallet = await getWalletBalance(connectDB, request.user.id);
    return response.json({ data: wallet });
  } catch (error) {
    return response.status(error.statusCode || 500).json({ error: error.message });
  }
}

export async function addDemoFundsController(request, response) {
  if (process.env.NODE_ENV === "production") {
    return response.status(404).json({ error: "Demo top-ups are not available" });
  }

  const amount = parsePositiveAmount(request.body?.amount);
  if (amount === null) {
    return response.status(400).json({
      error: "amount must be positive with up to two decimal places"
    });
  }

  try {
    const result = await addDemoFunds(connectDB, { userId: request.user.id, amount });
    return response.status(201).json({ data: result });
  } catch (error) {
    return response.status(error.statusCode || 500).json({ error: error.message });
  }
}