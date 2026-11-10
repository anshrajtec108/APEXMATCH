import connectDB from "../config/db.js";
import { createBooking } from "../services/bookingService.js";

export async function createBookingController(request, response) {
  try {
    const { eventId, seatNumber } = request.body;
    if (!Number.isInteger(eventId) || typeof seatNumber !== "string" || !seatNumber.trim()) {
      return response.status(400).json({ error: "eventId and seatNumber are required" });
    }

    const booking = await createBooking(connectDB, {
      userId: request.user.id,
      eventId,
      seatNumber: seatNumber.trim()
    });
    return response.status(201).json({ data: booking });
  } catch (error) {
    console.error("Booking failed:", error.message);
    return response.status(error.statusCode || 500).json({ error: error.message });
  }
}