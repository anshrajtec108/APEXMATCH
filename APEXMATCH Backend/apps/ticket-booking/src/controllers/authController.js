import connectDB from "../config/db.js";
import { authenticateUser, registerUser } from "../services/authService.js";

function validEmail(email) {
  return typeof email === "string" && email.length <= 100 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function registerController(request, response) {
  const { username, email, password } = request.body ?? {};
  const normalizedUsername = typeof username === "string" ? username.trim() : "";
  const normalizedEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
  const passwordBytes = typeof password === "string" ? Buffer.byteLength(password, "utf8") : 0;

  if (!/^[a-zA-Z0-9_.-]{3,50}$/.test(normalizedUsername)
      || !validEmail(normalizedEmail)
      || passwordBytes < 10
      || passwordBytes > 72) {
    return response.status(400).json({
      error: "username must be 3-50 valid characters, email must be valid, and password must be 10-72 bytes"
    });
  }

  try {
    const user = await registerUser(connectDB, {
      username: normalizedUsername,
      email: normalizedEmail,
      password
    });
    return response.status(201).json({ data: user });
  } catch (error) {
    return response.status(error.statusCode || 500).json({ error: error.message });
  }
}

export async function loginController(request, response) {
  const { email, password } = request.body ?? {};
  const normalizedEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
  if (!validEmail(normalizedEmail) || typeof password !== "string" || password.length === 0) {
    return response.status(400).json({ error: "Valid email and password are required" });
  }

  try {
    const result = await authenticateUser(connectDB, { email: normalizedEmail, password });
    return response.json({ data: result });
  } catch (error) {
    return response.status(error.statusCode || 500).json({ error: error.message });
  }
}