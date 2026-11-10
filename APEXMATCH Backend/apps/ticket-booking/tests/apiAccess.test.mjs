import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import { createApp } from "../src/server.js";
import { signAccessToken } from "../src/services/authService.js";

process.env.JWT_SECRET ??= "test-only-secret-that-is-long-enough-123456";

test("API exposes health and protects booking, wallet, and admin routes", async () => {
  const auditEntries = [];
  const app = createApp({
    auditPool: {
      async query(_sql, values) {
        auditEntries.push(values);
        return { rowCount: 1, rows: [] };
      }
    }
  });
  const server = app.listen(0);
  await once(server, "listening");
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    const health = await fetch(`${baseUrl}/`);
    assert.equal(health.status, 200);
    assert.ok(health.headers.get("x-request-id"));

    const anonymousBooking = await fetch(`${baseUrl}/bookings`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ eventId: 1, seatNumber: "A001" })
    });
    assert.equal(anonymousBooking.status, 401);

    const anonymousWallet = await fetch(`${baseUrl}/wallets/me`);
    assert.equal(anonymousWallet.status, 401);

    const userToken = signAccessToken({ id: 17, role: "user" });
    const userAdminRequest = await fetch(`${baseUrl}/admin/users`, {
      headers: { authorization: `Bearer ${userToken}` }
    });
    assert.equal(userAdminRequest.status, 403);

    assert.ok(auditEntries.some((entry) => entry[3] === "/bookings"));
    assert.ok(auditEntries.some((entry) => entry[3] === "/wallets/me"));
    assert.ok(auditEntries.some((entry) => entry[3] === "/admin/users"));
  } finally {
    server.closeAllConnections();
    await new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
});