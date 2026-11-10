export async function getBookingMetrics(pool, windowMinutes) {
  const [summary, timeline] = await Promise.all([
    pool.query(
      `SELECT
         COUNT(*)::int AS attempts,
         COUNT(*) FILTER (WHERE status_code = 201)::int AS succeeded,
         COUNT(*) FILTER (WHERE status_code >= 400)::int AS rejected,
         COALESCE(ROUND(AVG(duration_ms) FILTER (WHERE status_code = 201), 2), 0) AS average_success_ms,
         COALESCE(ROUND((percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms)
           FILTER (WHERE status_code = 201))::numeric, 2), 0) AS p95_success_ms
       FROM audit_logs
       WHERE method = 'POST' AND path = '/bookings'
         AND created_at >= NOW() - ($1 * INTERVAL '1 minute')`,
      [windowMinutes]
    ),
    pool.query(
      `SELECT date_trunc('minute', created_at) AS minute,
         COUNT(*)::int AS attempts,
         COUNT(*) FILTER (WHERE status_code = 201)::int AS succeeded,
         COUNT(*) FILTER (WHERE status_code >= 400)::int AS rejected
       FROM audit_logs
       WHERE method = 'POST' AND path = '/bookings'
         AND created_at >= NOW() - ($1 * INTERVAL '1 minute')
       GROUP BY date_trunc('minute', created_at)
       ORDER BY minute`,
      [windowMinutes]
    )
  ]);

  return {
    windowMinutes,
    summary: summary.rows[0],
    timeline: timeline.rows
  };
}

export async function getRecentAudit(pool, { limit, offset }) {
  const result = await pool.query(
    `SELECT id, request_id, actor_user_id, method, path, status_code,
       duration_ms, ip_address, created_at
     FROM audit_logs
     ORDER BY created_at DESC, id DESC
     LIMIT $1 OFFSET $2`,
    [limit, offset]
  );
  return result.rows;
}

export async function getRecentBookings(pool, limit) {
  const result = await pool.query(
    `SELECT id, user_id, event_id, seat_id, status, booking_date
     FROM bookings
     ORDER BY booking_date DESC, id DESC
     LIMIT $1`,
    [limit]
  );
  return result.rows;
}

export async function getUsers(pool, limit) {
  const result = await pool.query(
    `SELECT id, username, email, role, created_at
     FROM users
     ORDER BY created_at DESC, id DESC
     LIMIT $1`,
    [limit]
  );
  return result.rows;
}

export async function getDatabaseLocks(pool) {
  const result = await pool.query(
    `SELECT blocked.pid AS blocked_pid,
       blocked_activity.usename AS blocked_user,
       blocked_activity.application_name AS blocked_application,
       blocked_activity.wait_event_type,
       blocked_activity.wait_event,
       blocking.pid AS blocking_pid,
       blocking_activity.usename AS blocking_user,
       blocking_activity.application_name AS blocking_application,
       blocked_activity.query AS blocked_query,
       blocking_activity.query AS blocking_query
     FROM pg_catalog.pg_locks AS blocked
     JOIN pg_catalog.pg_stat_activity AS blocked_activity
       ON blocked_activity.pid = blocked.pid
     JOIN LATERAL unnest(pg_catalog.pg_blocking_pids(blocked.pid)) AS blocking(pid)
       ON TRUE
     JOIN pg_catalog.pg_stat_activity AS blocking_activity
       ON blocking_activity.pid = blocking.pid
     WHERE NOT blocked.granted
     ORDER BY blocked_activity.query_start` 
  );
  return result.rows;
}