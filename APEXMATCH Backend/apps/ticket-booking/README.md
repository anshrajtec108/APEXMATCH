# Ticket Booking API

This service uses Node.js, Express, and PostgreSQL. PostgreSQL is the source of truth for users, seat availability, bookings, wallets, and audit records. Redis support is optional and currently reserved for future idempotency/cache work; the booking transaction does not rely on Redis for correctness. Set `REDIS_ENABLED=true` when Redis is available.

## Run Locally

1. Install dependencies with `npm install`.
2. Copy `.env.example` to `.env` and set `JWT_SECRET` to a private random value of at least 32 bytes. Generate one with `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`.
3. Start PostgreSQL and configure the database values in `.env`. Start Redis and set `REDIS_ENABLED=true` only when you want its health check enabled.
4. Run `npm start`.

Non-production startup creates demo data. Demo accounts use `user01@example.com` through `user10@example.com`; their shared password is `phase1-demo-password`. Set both `ADMIN_EMAIL` and `ADMIN_PASSWORD` to provision an administrator at startup. Public registration cannot assign the admin role.

Run unit tests with `npm test`. The concurrency proof is `npm run test:concurrency`; it requires a running API and database plus at least 100 demo users (`DEMO_USER_COUNT=100`).

## API

Registration accepts a username, email, and password. Passwords must be 10-72 UTF-8 bytes. Login returns a 15-minute JWT access token.

```http
POST /auth/register
Content-Type: application/json

{"username":"alex","email":"alex@example.com","password":"a-long-password"}
```

```http
POST /auth/login
Content-Type: application/json

{"email":"alex@example.com","password":"a-long-password"}
```

Send the returned token as `Authorization: Bearer <token>` for bookings and wallet routes. The authenticated identity determines the booking user and wallet; clients cannot choose another user ID.

```http
GET /events/1/seats/A001
POST /bookings
Authorization: Bearer <token>
Content-Type: application/json

{"eventId":1,"seatNumber":"A001"}
```

The price endpoint lets a client inspect price and availability first. Booking then locks the seat and wallet, debits the database seat price, records a debit transaction, confirms the booking, and marks the seat sold in one PostgreSQL transaction. Insufficient balance returns `402`; unavailable seats return `409`.

`GET /wallets/me` returns the signed-in user's balance. `POST /wallets/me/demo-top-up` accepts `{"amount":"50.00"}` in non-production environments only. This is not a payment integration.

## Admin And Monitoring

All `/admin` endpoints require a JWT for an account provisioned with the admin role:

- `GET /admin/health`: PostgreSQL, Redis, and process uptime.
- `GET /admin/locks`: active PostgreSQL blocking lock relationships.
- `GET /admin/metrics/bookings?minutes=60`: attempts, successes, rejected requests, average successful request time, p95 successful request time, and per-minute counts.
- `GET /admin/audit-logs?limit=100&offset=0`: recent request audit records.
- `GET /admin/bookings?limit=100`: recent bookings.
- `GET /admin/users?limit=100`: user directory without password hashes.

Each API request also emits a structured console log and receives an `x-request-id` response header. Audit rows contain method, path, actor ID when authenticated, status, elapsed milliseconds, and IP address; request bodies and passwords are never recorded.

This is a learning backend milestone, not yet a public production deployment. Production startup requires an explicit `CORS_ORIGINS` allowlist. Before exposing it publicly, add a real payment provider, refresh/revocation strategy, distributed rate limiting, secret management, backups, and an operational queue/outbox for durable asynchronous work.