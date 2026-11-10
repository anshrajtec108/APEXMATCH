import dotenv from "dotenv";
import pg from "pg";
import { signAccessToken } from "../src/services/authService.js";

dotenv.config();

const { Pool } = pg;
const pool = new Pool({
  host: process.env.DB_HOST || "127.0.0.1",
  port: Number(process.env.DB_PORT || 5432),
  user: process.env.DB_USER || "postgres",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "ticket_booking"
});

const apiUrl = `http://127.0.0.1:${process.env.PORT || 3000}/bookings`;
const client = await pool.connect();
let eventId;

try {
  const event = await client.query(
    `INSERT INTO events (name, event_type, description, starts_at, location, status)
     VALUES ($1, 'test', 'Concurrency verification event', NOW(), 'Test venue', 'published')
     RETURNING id`,
    [`Concurrency Test ${Date.now()}`]
  );
  eventId = event.rows[0].id;

  await client.query(
    `INSERT INTO seats (event_id, seat_number, price, status)
     VALUES ($1, 'A001', 100, 'available')`,
    [eventId]
  );

  const users = await client.query("SELECT id FROM users ORDER BY id LIMIT 100");
  if (users.rowCount < 100) {
    throw new Error(`Need 100 users for this test; found ${users.rowCount}`);
  }

  const responses = await Promise.all(
    Array.from({ length: 100 }, (_, index) =>
      fetch(apiUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${signAccessToken({ id: users.rows[index].id, role: "user" })}`
        },
        body: JSON.stringify({
          eventId,
          seatNumber: "A001"
        })
      })
    )
  );

  const successCount = responses.filter((response) => response.status === 201).length;
  const rejectedCount = responses.filter((response) => response.status === 409).length;
  const bookingCount = await client.query(
    "SELECT COUNT(*)::int AS count FROM bookings WHERE event_id = $1 AND seat_id = (SELECT id FROM seats WHERE event_id = $1 AND seat_number = 'A001')",
    [eventId]
  );

  console.log(`SUCCESS = ${successCount}`);
  console.log(`REJECTED = ${rejectedCount}`);
  console.log(`DATABASE BOOKINGS FOR A001 = ${bookingCount.rows[0].count}`);

  if (successCount !== 1 || rejectedCount !== 99 || bookingCount.rows[0].count !== 1) {
    throw new Error("Concurrency proof failed");
  }

  console.log("Concurrency proof passed");
} finally {
  try {
    if (eventId !== undefined) {
      await client.query("BEGIN");
      await client.query("DELETE FROM bookings WHERE event_id = $1", [eventId]);
      await client.query("DELETE FROM seats WHERE event_id = $1", [eventId]);
      await client.query("DELETE FROM events WHERE id = $1", [eventId]);
      await client.query("COMMIT");
    }
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}
