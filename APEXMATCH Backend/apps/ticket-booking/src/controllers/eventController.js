import connectDB from "../config/db.js";
import { getSeatPrice } from "../services/bookingService.js";

export async function seatPriceController(request, response) {
  const eventId = Number(request.params.eventId);
  const seatNumber = request.params.seatNumber;
  if (!Number.isSafeInteger(eventId) || eventId < 1 || !seatNumber) {
    return response.status(400).json({ error: "A valid eventId and seatNumber are required" });
  }

  try {
    const seat = await getSeatPrice(connectDB, { eventId, seatNumber });
    return response.json({ data: seat });
  } catch (error) {
    return response.status(error.statusCode || 500).json({ error: error.message });
  }
}