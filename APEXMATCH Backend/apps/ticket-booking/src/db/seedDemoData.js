import bcrypt from "bcryptjs";

function positiveCount(value, fallback) {
  const count = Number(value || fallback);
  return Number.isInteger(count) && count > 0 ? count : fallback;
}

function demoWalletBalance() {
  const balance = process.env.DEMO_WALLET_BALANCE ?? "1000.00";
  if (!/^\d{1,8}(?:\.\d{1,2})?$/.test(balance)) {
    throw new Error("DEMO_WALLET_BALANCE must be a non-negative amount with up to two decimal places");
  }
  return balance;
}

export async function seedDemoData(pool) {
  const userCount = positiveCount(process.env.DEMO_USER_COUNT, 10);
  const seatCount = positiveCount(process.env.DEMO_SEAT_COUNT, 10);
  const startingBalance = demoWalletBalance();
  const demoEmails = Array.from(
    { length: userCount },
    (_, index) => `user${String(index + 1).padStart(2, "0")}@example.com`
  );
  const demoPasswordHash = await bcrypt.hash("phase1-demo-password", 12);
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    for (let number = 1; number <= userCount; number += 1) {
      await client.query(
        `INSERT INTO users (username, email, password_hash)
         VALUES ($1, $2, $3)
         ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash`,
        [`user${String(number).padStart(2, "0")}`, `user${String(number).padStart(2, "0")}@example.com`, demoPasswordHash]
      );
    }

    await client.query(
      `INSERT INTO wallets (user_id, balance)
       SELECT id, $1 FROM users WHERE email = ANY($2::text[])
       ON CONFLICT (user_id) DO NOTHING`,
      [startingBalance, demoEmails]
    );

    const events = await client.query(
      `INSERT INTO events (name, event_type, description, starts_at, location, status)
       VALUES
         ('Previous Demo Match', 'sports', 'Closed demo event', '2026-09-01 19:00:00', 'Demo Stadium', 'closed'),
         ('Apex Match Demo', 'sports', 'Active demo event for booking', '2027-01-15 19:00:00', 'Demo Stadium', 'published')
       ON CONFLICT (name, starts_at) DO UPDATE SET name = EXCLUDED.name
       RETURNING id, name`
    );

    for (const event of events.rows) {
      for (let number = 1; number <= seatCount; number += 1) {
        await client.query(
          `INSERT INTO seats (event_id, seat_number, price)
           VALUES ($1, $2, $3)
           ON CONFLICT (event_id, seat_number) DO NOTHING`,
          [event.id, `A${String(number).padStart(3, "0")}`, 100]
        );
      }
    }

    await client.query("COMMIT");
    console.log(`Demo data ready: ${userCount} users and ${seatCount} seats per event`);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
