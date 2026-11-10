import { randomUUID } from "node:crypto";

export function requestAudit(pool) {
  return (request, response, next) => {
    const requestId = randomUUID();
    const startedAt = process.hrtime.bigint();
    request.requestId = requestId;
    response.setHeader("x-request-id", requestId);

    response.once("finish", () => {
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
      const entry = {
        requestId,
        userId: request.user?.id ?? null,
        method: request.method,
        path: request.originalUrl.split("?")[0].slice(0, 255),
        statusCode: response.statusCode,
        durationMs: Number(durationMs.toFixed(3)),
        ipAddress: request.ip ?? null
      };
      console.log(JSON.stringify(entry));

      pool.query(
        `INSERT INTO audit_logs
           (request_id, actor_user_id, method, path, status_code, duration_ms, ip_address)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          entry.requestId,
          entry.userId,
          entry.method,
          entry.path,
          entry.statusCode,
          entry.durationMs,
          entry.ipAddress
        ]
      ).catch((error) => {
        console.error("Failed to persist request audit entry:", error.message);
      });
    });

    next();
  };
}