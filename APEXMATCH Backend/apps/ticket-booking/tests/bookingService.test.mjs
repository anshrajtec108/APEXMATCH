import assert from "node:assert/strict";
import test from "node:test";
import { createBooking, getSeatPrice } from "../src/services/bookingService.js";

function createPool({ price = "25.00", balance = "50.00", seatAvailable = true } = {}) {
  const queries = [];
  const client = {
    async query(sql, values = []) {
      const normalizedSql = sql.replace(/\s+/g, " ").trim();
      queries.push({ sql: normalizedSql, values });

      if (normalizedSql === "SELECT id FROM users WHERE id = $1") {
        return { rows: [{ id: values[0] }], rowCount: 1 };
      }
      if (normalizedSql.startsWith("SELECT id, price FROM seats")) {
        return seatAvailable
          ? { rows: [{ id: 8, price }], rowCount: 1 }
          : { rows: [], rowCount: 0 };
      }
      if (normalizedSql === "SELECT id FROM wallets WHERE user_id = $1 FOR UPDATE") {
        return { rows: [{ id: 12 }], rowCount: 1 };
      }
      if (normalizedSql.startsWith("UPDATE wallets")) {
        const newBalance = Number(balance) - Number(values[0]);
        return newBalance >= 0
          ? { rows: [{ balance: newBalance.toFixed(2) }], rowCount: 1 }
          : { rows: [], rowCount: 0 };
      }
      if (normalizedSql.startsWith("INSERT INTO bookings")) {
        return {
          rows: [{ id: 91, user_id: values[0], event_id: values[1], seat_id: values[2], status: "confirmed" }],
          rowCount: 1
        };
      }
      return { rows: [], rowCount: 1 };
    },
    release() {}
  };

  return {
    queries,
    async connect() {
      return client;
    },
    async query(sql, values) {
      queries.push({ sql, values });
      return { rows: [{ event_id: 3, seat_number: "A001", price, status: "available" }], rowCount: 1 };
    }
  };
}

test("booking atomically charges the listed price and records a debit", async () => {
  const pool = createPool({ price: "25.00", balance: "50.00" });
  const booking = await createBooking(pool, { userId: 4, eventId: 3, seatNumber: "A001" });

  assert.equal(booking.ticket_price, "25.00");
  assert.equal(booking.wallet_balance, "25.00");
  assert.ok(pool.queries.some(({ sql, values }) => sql.includes("wallet_transactions")
    && sql.includes("'debit'") && values[1] === "25.00"));
  assert.ok(pool.queries.some(({ sql }) => sql === "COMMIT"));
});

test("insufficient balance rolls back without creating a booking or ledger entry", async () => {
  const pool = createPool({ price: "25.00", balance: "10.00" });
  await assert.rejects(
    createBooking(pool, { userId: 4, eventId: 3, seatNumber: "A001" }),
    (error) => error.statusCode === 402 && error.message === "Insufficient wallet balance"
  );
  assert.ok(pool.queries.some(({ sql }) => sql === "ROLLBACK"));
  assert.equal(pool.queries.some(({ sql }) => sql.includes("INSERT INTO bookings")), false);
  assert.equal(pool.queries.some(({ sql }) => sql.includes("wallet_transactions")), false);
});

test("unavailable seat is rejected before wallet debit", async () => {
  const pool = createPool({ seatAvailable: false });
  await assert.rejects(
    createBooking(pool, { userId: 4, eventId: 3, seatNumber: "A001" }),
    (error) => error.statusCode === 409
  );
  assert.ok(pool.queries.some(({ sql }) => sql === "ROLLBACK"));
  assert.equal(pool.queries.some(({ sql }) => sql.startsWith("UPDATE wallets")), false);
});

test("seat pricing can be checked before booking", async () => {
  const pool = createPool({ price: "25.00" });
  const seat = await getSeatPrice(pool, { eventId: 3, seatNumber: "A001" });

  assert.equal(seat.price, "25.00");
  assert.equal(seat.status, "available");
});