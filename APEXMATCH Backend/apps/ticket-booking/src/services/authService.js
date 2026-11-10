import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const jwtIssuer = "apexmatch-api";
const jwtAudience = "apexmatch-client";

export function assertJwtConfiguration() {
  const secret = process.env.JWT_SECRET;
  if (!secret || Buffer.byteLength(secret) < 32) {
    throw new Error("JWT_SECRET must be configured with at least 32 bytes");
  }
  return secret;
}

export function assertRuntimeConfiguration() {
  assertJwtConfiguration();
  const origins = (process.env.CORS_ORIGINS || "").split(",").map((origin) => origin.trim()).filter(Boolean);
  if (process.env.NODE_ENV === "production" && origins.length === 0) {
    throw new Error("CORS_ORIGINS must contain the allowed frontend origin(s) in production");
  }
}

export function signAccessToken(user) {
  return jwt.sign({ role: user.role }, assertJwtConfiguration(), {
    algorithm: "HS256",
    subject: String(user.id),
    issuer: jwtIssuer,
    audience: jwtAudience,
    expiresIn: process.env.JWT_EXPIRES_IN || "15m"
  });
}

export function verifyAccessToken(token) {
  return jwt.verify(token, assertJwtConfiguration(), {
    algorithms: ["HS256"],
    issuer: jwtIssuer,
    audience: jwtAudience
  });
}

export async function registerUser(pool, { username, email, password }) {
  const passwordHash = await bcrypt.hash(password, 12);
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const result = await client.query(
      `INSERT INTO users (username, email, password_hash)
       VALUES ($1, $2, $3)
       RETURNING id, username, email, role, created_at`,
      [username, email, passwordHash]
    );
    await client.query("INSERT INTO wallets (user_id) VALUES ($1)", [result.rows[0].id]);
    await client.query("COMMIT");
    return result.rows[0];
  } catch (error) {
    await client.query("ROLLBACK");
    if (error.code === "23505") {
      error.statusCode = 409;
      error.message = "Username or email is already registered";
    }
    throw error;
  } finally {
    client.release();
  }
}

export async function authenticateUser(pool, { email, password }) {
  const result = await pool.query(
    "SELECT id, username, email, role, password_hash FROM users WHERE email = $1",
    [email]
  );
  const user = result.rows[0];
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    const error = new Error("Invalid email or password");
    error.statusCode = 401;
    throw error;
  }

  const publicUser = {
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role
  };
  return { user: publicUser, accessToken: signAccessToken(user) };
}

export async function provisionAdminUser(pool) {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (!email && !password) return;
  if (!email || !password || Buffer.byteLength(password, "utf8") < 12 || Buffer.byteLength(password, "utf8") > 72) {
    throw new Error("Set both ADMIN_EMAIL and an ADMIN_PASSWORD of 12-72 bytes to provision an administrator");
  }

  const username = process.env.ADMIN_USERNAME?.trim() || "admin";
  const passwordHash = await bcrypt.hash(password, 12);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(
      `INSERT INTO users (username, email, password_hash, role)
       VALUES ($1, $2, $3, 'admin')
       ON CONFLICT (email) DO UPDATE
       SET password_hash = EXCLUDED.password_hash, role = 'admin'
       RETURNING id`,
      [username, email, passwordHash]
    );
    await client.query(
      "INSERT INTO wallets (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING",
      [result.rows[0].id]
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}