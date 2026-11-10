import assert from "node:assert/strict";
import test from "node:test";
import bcrypt from "bcryptjs";
import {
  authenticateUser,
  registerUser,
  signAccessToken,
  verifyAccessToken
} from "../src/services/authService.js";
import { authenticate, requireAdmin } from "../src/middleware/authenticate.js";

process.env.JWT_SECRET ??= "test-only-secret-that-is-long-enough-123456";

function fakePool({ user, failUserInsert = false } = {}) {
  const statements = [];
  const client = {
    async query(sql, values = []) {
      statements.push({ sql, values });
      if (sql.includes("INSERT INTO users") && failUserInsert) {
        const error = new Error("duplicate");
        error.code = "23505";
        throw error;
      }
      if (sql.includes("INSERT INTO users")) {
        return { rows: [{ id: 41, username: "learner", email: "learner@example.com", role: "user" }] };
      }
      return { rows: user ? [user] : [], rowCount: user ? 1 : 0 };
    },
    release() {
      statements.push({ sql: "RELEASE", values: [] });
    }
  };

  return {
    statements,
    async connect() {
      return client;
    },
    async query(sql, values) {
      statements.push({ sql, values });
      return { rows: user ? [user] : [], rowCount: user ? 1 : 0 };
    }
  };
}

test("registration hashes the password and creates a wallet atomically", async () => {
  const pool = fakePool();
  await registerUser(pool, {
    username: "learner",
    email: "learner@example.com",
    password: "a-long-demo-password"
  });

  const insert = pool.statements.find((statement) => statement.sql.includes("INSERT INTO users"));
  assert.notEqual(insert.values[2], "a-long-demo-password");
  assert.equal(await bcrypt.compare("a-long-demo-password", insert.values[2]), true);
  assert.ok(pool.statements.some((statement) => statement.sql.includes("INSERT INTO wallets")));
  assert.ok(pool.statements.some((statement) => statement.sql === "COMMIT"));
});

test("registration reports duplicate username or email as a conflict", async () => {
  const pool = fakePool({ failUserInsert: true });
  await assert.rejects(
    registerUser(pool, { username: "learner", email: "learner@example.com", password: "a-long-demo-password" }),
    (error) => error.statusCode === 409
  );
  assert.ok(pool.statements.some((statement) => statement.sql === "ROLLBACK"));
});

test("login returns a signed token without exposing the password hash", async () => {
  const passwordHash = await bcrypt.hash("a-long-demo-password", 4);
  const pool = fakePool({
    user: {
      id: 41,
      username: "learner",
      email: "learner@example.com",
      role: "user",
      password_hash: passwordHash
    }
  });
  const result = await authenticateUser(pool, {
    email: "learner@example.com",
    password: "a-long-demo-password"
  });
  const claims = verifyAccessToken(result.accessToken);

  assert.equal(result.user.id, 41);
  assert.equal("password_hash" in result.user, false);
  assert.equal(claims.sub, "41");
  assert.equal(claims.role, "user");
});

test("authentication middleware rejects anonymous requests and accepts valid bearer tokens", () => {
  const response = {
    statusCode: 200,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    }
  };
  const anonymousRequest = { get: () => undefined };
  authenticate(anonymousRequest, response, () => assert.fail("anonymous request should not pass"));
  assert.equal(response.statusCode, 401);

  const token = signAccessToken({ id: 7, role: "user" });
  const request = { get: () => `Bearer ${token}` };
  let passed = false;
  authenticate(request, response, () => { passed = true; });
  assert.equal(passed, true);
  assert.deepEqual(request.user, { id: 7, role: "user" });
});

test("admin authorization rejects users and accepts administrators", () => {
  const response = {
    statusCode: 200,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    }
  };
  requireAdmin({ user: { role: "user" } }, response, () => assert.fail("user should not pass"));
  assert.equal(response.statusCode, 403);

  let passed = false;
  requireAdmin({ user: { role: "admin" } }, response, () => { passed = true; });
  assert.equal(passed, true);
});