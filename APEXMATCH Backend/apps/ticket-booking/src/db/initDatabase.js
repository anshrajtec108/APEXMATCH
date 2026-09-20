import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { seedDemoData } from "./seedDemoData.js";

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const schemaDirectory = path.resolve(
  currentDirectory,
  "../../../../database/mysql/schemas/ticket-booking"
);

const schemaFiles = [
  "users.sql",
  "events.sql",
  "seats.sql",
  "bookings.sql",
  "wallets.sql",
  "wallet_transactions.sql"
];

export async function initializeDatabase(pool) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    for (const fileName of schemaFiles) {
      const sql = await fs.readFile(path.join(schemaDirectory, fileName), "utf8");
      await client.query(sql);
    }
    await client.query("COMMIT");
    await seedDemoData(pool);
    console.log("PostgreSQL schema and demo data are ready");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}