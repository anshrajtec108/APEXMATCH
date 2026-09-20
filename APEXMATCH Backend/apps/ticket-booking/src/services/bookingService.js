
export async function createBooking(pool, { userId, eventId, seatNumber }) {
    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        const user = await client.query("SELECT id FROM users WHERE id = $1", [userId]);
        if (user.rowCount === 0) {
            const error = new Error("User not found");
            error.statusCode = 404;
            throw error;
        }

        const seat = await client.query(
            `SELECT id
             FROM seats
             WHERE event_id = $1
                 AND seat_number = $2
                 AND status = 'available'
             FOR UPDATE`,
            [eventId, seatNumber]
        );
        if (seat.rowCount === 0) {
            const error = new Error("Seat is not available");
            error.statusCode = 409;
            throw error;
        }

        const booking = await client.query(
            `INSERT INTO bookings (user_id, event_id, seat_id, status)
             VALUES ($1, $2, $3, 'confirmed')
             RETURNING id, user_id, event_id, seat_id, status, booking_date`,
            [userId, eventId, seat.rows[0].id]
        );

        await client.query("UPDATE seats SET status = 'sold' WHERE id = $1", [seat.rows[0].id]);
        await client.query("COMMIT");
        return booking.rows[0];
    } catch (error) {
        await client.query("ROLLBACK");
        if (error.code === "23505") {
            error.statusCode = 409;
            error.message = "Seat has already been booked";
        }
        throw error;
    } finally {
        client.release();
    }
}