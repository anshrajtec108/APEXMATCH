import { verifyAccessToken } from "../services/authService.js";

export function authenticate(request, response, next) {
  const authorization = request.get("authorization") || "";
  const match = /^Bearer\s+([^\s]+)$/i.exec(authorization);
  if (!match) {
    return response.status(401).json({ error: "Bearer access token is required" });
  }

  try {
    const claims = verifyAccessToken(match[1]);
    const userId = Number(claims.sub);
    if (!Number.isSafeInteger(userId) || userId < 1) {
      return response.status(401).json({ error: "Invalid access token" });
    }
    request.user = { id: userId, role: claims.role };
    return next();
  } catch {
    return response.status(401).json({ error: "Invalid or expired access token" });
  }
}

export function requireAdmin(request, response, next) {
  if (request.user?.role !== "admin") {
    return response.status(403).json({ error: "Administrator access required" });
  }
  return next();
}