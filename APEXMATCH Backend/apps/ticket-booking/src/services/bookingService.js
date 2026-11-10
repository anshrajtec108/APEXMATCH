
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
            `SELECT id, price
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

        const wallet = await client.query(
            "SELECT id FROM wallets WHERE user_id = $1 FOR UPDATE",
            [userId]
        );
        if (wallet.rowCount === 0) {
            const error = new Error("Wallet not found");
            error.statusCode = 404;
            throw error;
        }

        const debit = await client.query(
            `UPDATE wallets
             SET balance = balance - $1
             WHERE id = $2 AND balance >= $1
             RETURNING balance`,
            [seat.rows[0].price, wallet.rows[0].id]
        );
        if (debit.rowCount === 0) {
            const error = new Error("Insufficient wallet balance");
            error.statusCode = 402;
            throw error;
        }

        await client.query(
            `INSERT INTO wallet_transactions (wallet_id, amount, transaction_type)
             VALUES ($1, $2, 'debit')`,
            [wallet.rows[0].id, seat.rows[0].price]
        );

        const booking = await client.query(
            `INSERT INTO bookings (user_id, event_id, seat_id, status)
             VALUES ($1, $2, $3, 'confirmed')
             RETURNING id, user_id, event_id, seat_id, status, booking_date`,
            [userId, eventId, seat.rows[0].id]
        );

        await client.query("UPDATE seats SET status = 'sold' WHERE id = $1", [seat.rows[0].id]);
        await client.query("COMMIT");
        return {
            ...booking.rows[0],
            ticket_price: seat.rows[0].price,
            wallet_balance: debit.rows[0].balance
        };
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

export async function getSeatPrice(pool, { eventId, seatNumber }) {
    const result = await pool.query(
        `SELECT event_id, seat_number, price, status
         FROM seats
         WHERE event_id = $1 AND seat_number = $2`,
        [eventId, seatNumber]
    );
    if (result.rowCount === 0) {
        const error = new Error("Seat not found");
        error.statusCode = 404;
        throw error;
    }
    return result.rows[0];
}