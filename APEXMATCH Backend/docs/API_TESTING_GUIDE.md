# APEXMATCH API Testing and Project Showcase Guide

## Scope and Verification Labels

This guide describes the current ticket-booking implementation, not the broader roadmap in `Final Req.txt`. The API uses PostgreSQL. The schema files are currently stored under `database/mysql/`, but their SQL and the application driver are PostgreSQL (`pg`); this directory name does not mean the app runs on MySQL.

Verification labels:

- **PASSED**: executed in this inspection; the stated assertion passed.
- **BLOCKED**: not executed, requires configuration/data/feature that was unavailable, or the behavior is not implemented.
- **FAILED**: an executed    failed. No current test command failed.

The endpoint count is **13**: health (1), auth (2), event price (1), booking (1), wallet (2), and admin (6).

## Start and Configure

Run commands from PowerShell:

```powershell
Set-Location "APEXMATCH Backend/apps/ticket-booking"
npm install
Copy-Item .env.example .env
```

Set a private JWT secret of at least 32 bytes in `.env`. Do not commit `.env` or use a sample value in a public deployment. For a local temporary secret in PowerShell:

```powershell
$env:JWT_SECRET = node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Start PostgreSQL and set `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, and `DB_NAME` in `.env`. Redis is optional: leave `REDIS_ENABLED=false` for this implementation. `CORS_ORIGINS` is required when `NODE_ENV=production`. Set both `ADMIN_EMAIL` and `ADMIN_PASSWORD` to provision an admin at startup; the admin password must be 12-72 bytes. Non-production startup seeds demo data. The checked-in example defaults to 10 users and 10 seats per event; the concurrency proof needs at least 100 users.

```powershell
npm start
```

The default API base URL is `http://localhost:3000`. Use a second terminal for requests/tests. With the checked-in demo seed, demo user `user01@example.com` has password `phase1-demo-password` (the seeder resets demo-account password hashes at each non-production startup).

## Endpoint Reference

Unless specified otherwise, JSON endpoints use `Content-Type: application/json`. Success and error bodies are JSON shaped as shown. PostgreSQL `NUMERIC` values may appear as decimal strings.

### 1. `GET /`

**Complete URL:** `http://localhost:3000/`  
**Purpose:** Basic process/API liveness response. No auth, parameters, or body.

```bash
curl -i http://localhost:3000/
```

**Success:** `200 OK`, `{"service":"ticket-booking","status":"ok"}`. The response also includes `x-request-id` and Helmet security headers. **Requires:** running Node process only.  
**Errors/failures:** connection refused means the server is stopped or listening on a different `PORT`. This route does not prove PostgreSQL or Redis is healthy; use admin health for dependency checks.

### 2. `POST /auth/register`

**Complete URL:** `http://localhost:3000/auth/register`  
**Purpose:** Register a normal user and create a zero-balance wallet in one database transaction. Public callers cannot select a role. No auth, path, or query parameters.

**Body:** `username` (3-50 ASCII letters/digits/underscore/dot/hyphen), `email` (valid format, max 100 chars), `password` (10-72 UTF-8 bytes).

```bash
curl -i -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"alex","email":"alex@example.com","password":"a-long-password"}'
```

**Success:** `201 Created`, `{"data":{"id":42,"username":"alex","email":"alex@example.com","role":"user","created_at":"<timestamp>"}}`.

**Errors:** `400` invalid/missing fields; `409` duplicate username or email; `429` registration limiter exceeded (5 attempts/IP per hour); `500` DB/transaction failure. The login/registration limiters use the default in-memory store, so they are per-process and reset on restart. **Requires:** PostgreSQL `users` and `wallets` tables.

**Common failures:** missing JWT secret stops the server before requests; missing tables/database causes `500`; duplicate usernames/emails cause `409`. Invalid JSON may be handled by Express/body-parser rather than the controller's JSON error shape.

### 3. `POST /auth/login`

**Complete URL:** `http://localhost:3000/auth/login`  
**Purpose:** Verify credentials and issue a signed 15-minute JWT access token. No auth, path, or query parameters.

**Body:** `email`, `password`.

```bash
curl -i -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user01@example.com","password":"phase1-demo-password"}'
```

**Success:** `200 OK`, `{"data":{"user":{"id":1,"username":"user01","email":"user01@example.com","role":"user"},"accessToken":"<JWT>"}}`. Password hashes are not returned.

**Errors:** `400` invalid/missing email or password; `401` wrong email/password; `429` more than 10 attempts/IP in 15 minutes; `500` database/JWT configuration failure. **Requires:** PostgreSQL users and stored bcrypt hash; valid `JWT_SECRET`.

**Common failures:** demo credentials work only for seeded demo accounts; registration-created accounts have their own password. Tokens signed using a different secret or expired tokens are rejected.

### 4. `GET /events/:eventId/seats/:seatNumber`

**Complete URL example:** `http://localhost:3000/events/2/seats/A001`  
**Purpose:** Read ticket price and current seat status before booking. Public endpoint; no auth. Path parameters: positive integer-like `eventId`, seat identifier `seatNumber`. No query/body.

```bash
curl -i http://localhost:3000/events/2/seats/A001
```

**Success:** `200 OK`, `{"data":{"event_id":2,"seat_number":"A001","price":"100.00","status":"available"}}` (IDs and numeric formatting depend on the database).

**Errors:** `400` invalid event ID/seat parameter; `404` no matching seat; `500` database error. A sold/held seat is returned with its status; this lookup does not reserve it. **Requires:** PostgreSQL `seats` table and referenced event.

**Common failures:** event ID and seat number must refer to an existing seat; prices/status may change before booking, so booking rechecks under lock.

### 5. `POST /bookings`

**Complete URL:** `http://localhost:3000/bookings`  
**Purpose:** Atomically book a seat and debit the authenticated user's wallet. Required header: `Authorization: Bearer <JWT>`. Body: integer `eventId`, non-empty string `seatNumber`. Client-supplied `userId` is ignored/not used.

```bash
curl -i -X POST http://localhost:3000/bookings \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"eventId":2,"seatNumber":"A001"}'
```

**Success:** `201 Created`, `{"data":{"id":91,"user_id":1,"event_id":2,"seat_id":12,"status":"confirmed","booking_date":"<timestamp>","ticket_price":"100.00","wallet_balance":"900.00"}}`.

**Errors:** `400` invalid/missing eventId or seatNumber; `401` missing/invalid/expired bearer token; `402` insufficient wallet balance; `404` user or wallet missing; `409` seat unavailable or unique seat constraint conflict; `500` unexpected database error. **Requires:** valid JWT, user and wallet records, available seat, booking/wallet/ledger tables.

**Consistency:** PostgreSQL transaction locks the available seat and wallet, checks/debits balance, inserts a debit ledger transaction and booking, marks the seat sold, then commits. Any thrown error rolls back. **Important:** there is no idempotency key. Retrying after an uncertain successful response does not replay the original response; the same seat is expected to return `409`.

### 6. `GET /wallets/me`

**Complete URL:** `http://localhost:3000/wallets/me`  
**Purpose:** Read the current authenticated user's wallet. Required header: `Authorization: Bearer <JWT>`. No query/path/body parameters.

```bash
curl -i http://localhost:3000/wallets/me -H "Authorization: Bearer <TOKEN>"
```

**Success:** `200 OK`, `{"data":{"user_id":1,"balance":"1000.00"}}`.

**Errors:** `401` missing/invalid/expired token; `404` no wallet for the authenticated user; `500` DB failure. **Requires:** PostgreSQL wallet row for the token subject.

### 7. `POST /wallets/me/demo-top-up`

**Complete URL:** `http://localhost:3000/wallets/me/demo-top-up`  
**Purpose:** Add simulated funds to the authenticated user's wallet and record a `credit` transaction. Required bearer token and JSON body `{ "amount": "50.00" }`. Amount must be positive, non-negative decimal syntax with at most two decimals and at most eight integer digits.

```bash
curl -i -X POST http://localhost:3000/wallets/me/demo-top-up \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"amount":"50.00"}'
```

**Success:** `201 Created`, `{"data":{"wallet":{"user_id":1,"balance":"1050.00"},"transaction":{"id":7,"amount":"50.00","transaction_type":"credit","transaction_date":"<timestamp>"}}}`.

**Errors:** `400` amount absent, nonnumeric, zero/negative, too many decimals, or too large; `401` token issue; `404` wallet absent; `500` DB failure. In `NODE_ENV=production`, this route returns `404` by design. **Requires:** wallet and wallet_transactions tables. This is not payment processing and must not be used to credit real accounts.

### 8. `GET /admin/health`

**Complete URL:** `http://localhost:3000/admin/health`  
**Purpose:** Check PostgreSQL, optional Redis, and process uptime. Required bearer token for a user with `admin` role. No query/body.

```bash
curl -i http://localhost:3000/admin/health -H "Authorization: Bearer <ADMIN_TOKEN>"
```

**Success:** `200 OK`, `{"data":{"status":"healthy","uptimeSeconds":123,"database":"ok","redis":"disabled"}}`; with `REDIS_ENABLED=true`, Redis must answer `PING` and is shown as `ok`.

**Errors:** `401` missing/invalid token; `403` non-admin; `503` database unavailable or enabled Redis unavailable. **Requires:** admin JWT, PostgreSQL; Redis only if explicitly enabled.

### 9. `GET /admin/locks`

**Complete URL:** `http://localhost:3000/admin/locks`  
**Purpose:** Return active PostgreSQL blocking lock relationships and relevant activity/query fields. Admin bearer token required. No query/body.

```bash
curl -i http://localhost:3000/admin/locks -H "Authorization: Bearer <ADMIN_TOKEN>"
```

**Success:** `200 OK`, `{"data":[]}` when no blocking locks exist, otherwise an array of blocked/blocking PIDs, users, applications, wait events, and queries.

**Errors:** `401` unauthenticated; `403` non-admin; `500` database/permission/query failure. **Requires:** PostgreSQL system views and sufficient DB permissions. It reports blocking locks only, not all granted locks.

### 10. `GET /admin/metrics/bookings`

**Complete URL:** `http://localhost:3000/admin/metrics/bookings?minutes=60`  
**Purpose:** Aggregate booking request attempts, status-based successes/rejections, average and p95 successful request durations, and per-minute counts. Admin bearer token required. Query `minutes` optional, integer 1-1440, default 60. No body.

```bash
curl -i "http://localhost:3000/admin/metrics/bookings?minutes=60" \
  -H "Authorization: Bearer <ADMIN_TOKEN>"
```

**Success:** `200 OK`, `{"data":{"windowMinutes":60,"summary":{"attempts":0,"succeeded":0,"rejected":0,"average_success_ms":"0","p95_success_ms":"0"},"timeline":[]}}` (values depend on audit rows).

**Errors:** `400` out-of-range/non-integer minutes; `401` token issue; `403` non-admin; `500` audit query failure. **Requires:** `audit_logs` table and PostgreSQL aggregate functions. Metrics are based on recorded HTTP requests whose method/path are `POST /bookings`, not database booking rows alone. Duration includes HTTP handling and is not a load-test benchmark.

### 11. `GET /admin/audit-logs`

**Complete URL:** `http://localhost:3000/admin/audit-logs?limit=100&offset=0`  
**Purpose:** Read recent HTTP audit records. Admin bearer token required. `limit` defaults to 100 and accepts 1-500; `offset` defaults to 0 and accepts 0-1,000,000. No body.

```bash
curl -i "http://localhost:3000/admin/audit-logs?limit=20&offset=0" \
  -H "Authorization: Bearer <ADMIN_TOKEN>"
```

**Success:** `200 OK`, `{"data":[{"id":1,"request_id":"<uuid>","actor_user_id":1,"method":"POST","path":"/bookings","status_code":201,"duration_ms":"12.345","ip_address":"127.0.0.1","created_at":"<timestamp>"}]}`.

**Errors:** `400` invalid limit/offset; `401` token issue; `403` non-admin; `500` database failure. **Requires:** PostgreSQL `audit_logs` table. Audit persistence is asynchronous after response finish; failures are logged but do not change the already-sent API response. IP addresses are sensitive operational data.

### 12. `GET /admin/bookings`

**Complete URL:** `http://localhost:3000/admin/bookings?limit=100`  
**Purpose:** List recent booking rows. Admin bearer token required. `limit` defaults to 100 and accepts 1-500. No body.

```bash
curl -i "http://localhost:3000/admin/bookings?limit=25" \
  -H "Authorization: Bearer <ADMIN_TOKEN>"
```

**Success:** `200 OK`, `{"data":[{"id":91,"user_id":1,"event_id":2,"seat_id":12,"status":"confirmed","booking_date":"<timestamp>"}]}`.

**Errors:** `400` invalid limit; `401` token issue; `403` non-admin; `500` DB failure. **Requires:** PostgreSQL bookings table.

### 13. `GET /admin/users`

**Complete URL:** `http://localhost:3000/admin/users?limit=100`  
**Purpose:** List users without password hashes. Admin bearer token required. `limit` defaults to 100 and accepts 1-500. No body.

```bash
curl -i "http://localhost:3000/admin/users?limit=25" \
  -H "Authorization: Bearer <ADMIN_TOKEN>"
```

**Success:** `200 OK`, `{"data":[{"id":1,"username":"user01","email":"user01@example.com","role":"user","created_at":"<timestamp>"}]}`.

**Errors:** `400` invalid limit; `401` token issue; `403` non-admin; `500` DB failure. **Requires:** PostgreSQL users table. Treat user email addresses as private data.

## Testing Checklist and Results

Use `npm test` for unit/HTTP tests. The HTTP access test starts an in-process Express server with a fake audit pool; service tests use mocked PostgreSQL clients. Only `npm run test:concurrency` exercises the real API/database concurrently. “Blocked” means no test was run for that case; it does not mean the expected behavior passed.

| Endpoint / case | Input and execution | Expected result | Actual result / status |
|---|---|---|---|
| `GET /` liveness | `GET /`; `npm test` HTTP access test | 200 JSON and `x-request-id` | **PASSED**, HTTP test asserted both |
| `POST /auth/register` valid | Valid username/email/password; call `registerUser` with fake pool | Hash password; insert user+wallet; commit; return user | **PASSED**, service unit test; database route not end-to-end tested |
| `POST /auth/register` duplicate | Duplicate unique key from fake DB | Rollback and 409 mapping | **PASSED**, service unit test |
| `POST /auth/register` missing/wrong types/invalid email/short or long password | Call HTTP route with each malformed body | 400, no user/wallet inserted | **BLOCKED**, controller validation not separately tested |
| `POST /auth/register` rate limit | Send 6 registrations from one IP within 1 hour | Later request gets 429 | **BLOCKED**, limiter not exercised |
| `POST /auth/login` valid | User with bcrypt hash; call `authenticateUser` | Return user+JWT, omit hash | **PASSED**, service unit test |
| `POST /auth/login` wrong password/nonexistent email/missing fields | Submit wrong credentials and malformed body | 401 for wrong credentials; 400 for malformed fields | **BLOCKED**, negative login cases not tested |
| `POST /auth/login` rate limit | Send 11 logins from one IP in 15 minutes | Later request gets 429 | **BLOCKED**, limiter not exercised |
| `GET /events/:eventId/seats/:seatNumber` existing seat | Call `getSeatPrice` with an available test seat | Return event, seat, price, status | **PASSED**, service unit test with fake pool; HTTP/database route not exercised |
| Event price invalid/nonexistent seat | Invalid event ID, unknown seat, malformed path | 400 or 404 | **BLOCKED**, route/controller edge cases not tested |
| `POST /bookings` valid paid booking | Mock available seat and sufficient wallet; call `createBooking` | 201 at HTTP layer; commit debit, ledger, booking, seat sale | **PASSED**, service transaction unit test; live success only in concurrency case |
| Booking without/invalid/expired JWT | Anonymous POST `/bookings` in HTTP test; invalid/expired token not separately sent | 401 and no database operation | **PASSED** for missing token; invalid/expired variants **BLOCKED** |
| Booking malformed body/wrong types/nonexistent event/user/wallet | POST invalid body or IDs | 400/404; no partial records | **BLOCKED**, these route/service cases not exercised |
| Booking unavailable seat | Mock unavailable seat | 409 and rollback before wallet debit | **PASSED**, booking service unit test |
| Booking insufficient funds | Mock balance below seat price | 402, rollback, no booking or debit ledger row | **PASSED**, booking service unit test |
| Booking 100-way same-seat contention | Start API, run `npm run test:concurrency` with 100 demo users | 1 x 201, 99 x 409, exactly one DB booking; fixture cleanup | **PASSED**, real PostgreSQL/API run: `SUCCESS = 1`, `REJECTED = 99`, DB count `1` |
| Booking duplicate/retry/idempotency key | Repeat exact successful request; optionally send `Idempotency-Key` | Current behavior: same seat should conflict; no replay/idempotency store exists | Same-seat concurrent duplicates **PASSED** in concurrency proof; retry-after-timeout and key behavior **BLOCKED / NOT IMPLEMENTED** |
| `GET /wallets/me` anonymous | GET without bearer token | 401 | **PASSED**, HTTP access test |
| Wallet balance authenticated/missing wallet | GET with valid user token; try a user without wallet | 200 wallet / 404 | **BLOCKED**, current HTTP test only checks anonymous denial |
| `POST /wallets/me/demo-top-up` valid/invalid | Credit a valid amount; try absent, zero, negative, malformed, >2 decimals | 201 + credit ledger; invalid amount 400 | **BLOCKED**, top-up route/service not covered by automated tests |
| Wallet top-up duplicate/retry/rollback | Repeat request; force ledger insert failure | Each call currently credits again; failed transaction rolls back | **BLOCKED**, not tested; operation has no idempotency key |
| `GET /admin/health` | Admin, normal user, anonymous; toggle Redis setting | Admin 200/503 by dependency state; 403 user; 401 anonymous | Admin endpoint result **BLOCKED**; shared router 401/403 behavior is tested on other routes |
| `GET /admin/locks` | Admin call with/without active blocking transaction | 200 list (possibly empty); DB error 500 | **BLOCKED**, no route-level lock test in current suite |
| `GET /admin/metrics/bookings` | Valid and invalid `minutes`; seed matching audit rows | 200 aggregated values / 400 invalid query | **BLOCKED**, metrics endpoint is not in automated tests |
| `GET /admin/audit-logs` | Valid and invalid limit/offset; inspect persisted request | 200 rows / 400 invalid query | **BLOCKED**, endpoint query/validation not tested |
| `GET /admin/bookings` | Admin valid limit; invalid limit; empty DB | 200 array / 400 invalid query | **BLOCKED**, admin listing route not tested |
| `GET /admin/users` | User token and admin token; valid/invalid limit | 403 user; admin 200 without hashes; invalid limit 400 | User 403 **PASSED** in HTTP test; admin 200/limit validation **BLOCKED** |
| Database rollback / partial failure | Force each SQL step to fail after wallet debit and before commit | No partial wallet/ledger/booking/seat change | Insufficient-funds/unavailable-seat rollback **PASSED** with mock client; injected real DB failures **BLOCKED** |
| Redis unavailable/cache/TTL | `REDIS_ENABLED=true`, stop Redis; inspect cache keys and TTL | Current code only connects and health-checks Redis; no cache/key/TTL behavior exists | Redis failure, cache, TTL tests **BLOCKED / NOT IMPLEMENTED**; Redis was disabled during verified runs |
| RabbitMQ delivery/retry/duplicates | Publish booking event and inspect worker retry/dead-letter behavior | No publisher, consumer, broker config, or outbox exists | **BLOCKED / NOT IMPLEMENTED** |
| CORS, malformed JSON, request body limit | Try disallowed Origin, invalid JSON, and >32 KB JSON | CORS rejection, parser error, 413 respectively | **BLOCKED**, no dedicated tests |

### Test commands and observed results

```powershell
# Unit and HTTP access suite
npm test

# In a separate terminal, start API after setting JWT_SECRET
npm start

# Set DEMO_USER_COUNT=100 before non-production startup; then run this in another terminal
npm run test:concurrency
```

Observed in this inspection: `npm test` reported **10 passed, 0 failed**. `npm run test:concurrency` reported **1 success, 99 rejected, 1 database booking**. The fixture created by the concurrency script is deleted in its `finally` cleanup. The production dependency audit was attempted but **BLOCKED** because npm registry DNS failed (`ENOTFOUND registry.npmjs.org`); no current audit result is claimed here.

## Debugging Guide

| Symptom / observed response | Likely cause | Relevant code | Reproduce and fix |
|---|---|---|---|
| Startup: `JWT_SECRET must be configured with at least 32 bytes` | Secret absent or too short | `src/services/authService.js`, `src/index.js` | Set a private 32-byte-or-longer value in `.env`; restart. Do not commit it. |
| Production startup: `CORS_ORIGINS must contain...` | Production has no browser-origin allowlist | `src/services/authService.js`; `src/server.js` | Set comma-separated exact frontend origins in `CORS_ORIGINS`, then restart. |
| PostgreSQL connection/refused or startup schema error | PostgreSQL stopped, wrong DB settings, missing permission, or schema SQL failure | `src/config/db.js`, `src/db/initDatabase.js`, `database/mysql/schemas/ticket-booking/*.sql` | Check `Get-Service postgresql*`; use `psql -h $env:DB_HOST -p $env:DB_PORT -U $env:DB_USER -d $env:DB_NAME -c "SELECT 1"`; verify `.env` keys and DB privileges. |
| Login returns 401 | Email/password mismatch or stale demo credentials | `src/controllers/authController.js`, `src/services/authService.js`, `src/db/seedDemoData.js` | Login with exact email; local seeded users use the documented demo password. Check `users.password_hash` is a bcrypt hash; startup resets seeded users' demo password. |
| Protected route returns 401 | Missing, malformed, expired, or differently signed bearer token | `src/middleware/authenticate.js` | Login again; send `Authorization: Bearer <accessToken>`; ensure API instances share `JWT_SECRET`. |
| Admin endpoint returns 403 | Token role is `user` | `src/middleware/authenticate.js`, `src/services/authService.js` | Set `ADMIN_EMAIL` and `ADMIN_PASSWORD` (12-72 bytes), restart, then log in as that admin. Never pass a role during public registration. |
| Booking returns 402 | Wallet balance is lower than locked seat price | `src/services/bookingService.js` | Check `SELECT user_id,balance FROM wallets WHERE user_id=<id>` and `SELECT price,status FROM seats WHERE event_id=<id> AND seat_number='<seat>'`. Use demo top-up only outside production. |
| Booking returns 409 | Seat is held/sold/already booked or unique seat constraint rejected it | `src/services/bookingService.js`, `database/mysql/schemas/ticket-booking/bookings.sql`, `.../seats.sql` | Query seat status and booking row; choose another available seat. Do not treat 409 as a replayed success; no idempotency contract exists. |
| Price lookup returns 404 | Seat/event pair does not exist | `src/services/bookingService.js`, `src/controllers/eventController.js` | Query `seats` by `event_id` and `seat_number`; use IDs from the seeded database. |
| Login/register returns 429 | In-memory per-IP limiter exceeded | `src/routes/authRoutes.js` | Wait for the window to reset or use a separate test environment. A multi-instance deployment needs a shared limiter store. |
| Audit row missing but API returned | Audit insert is asynchronous and failed after HTTP response | `src/middleware/requestAudit.js` | Inspect application stdout for `Failed to persist request audit entry`; verify `audit_logs` migration and DB availability. The response already sent cannot be rolled back. |
| Admin health shows Redis unavailable / 503 | `REDIS_ENABLED=true` but Redis cannot be reached | `src/config/redis.js`, `src/controllers/adminController.js`, `src/index.js` | Check `redis-cli -h 127.0.0.1 -p 6379 PING`; either start/configure Redis or set `REDIS_ENABLED=false`. Redis is not currently used for bookings. |
| Metrics are zero | No matching persisted `POST /bookings` audit rows in selected time window | `src/services/adminService.js`, `src/middleware/requestAudit.js` | Check `SELECT method,path,status_code,created_at FROM audit_logs ORDER BY id DESC LIMIT 20`; use `path='/bookings'` and widen `minutes`. |
| Live lock list empty | No PostgreSQL session is currently blocked | `src/services/adminService.js` | This is a valid state, not an error. To test, hold a row lock in a separate transaction and query while another session waits. |

Useful PowerShell/database commands:

```powershell
# App output appears in the terminal running npm start
npm start

# Inspect core records
psql -h $env:DB_HOST -p $env:DB_PORT -U $env:DB_USER -d $env:DB_NAME -c "SELECT id,email,role FROM users ORDER BY id LIMIT 20"
psql -h $env:DB_HOST -p $env:DB_PORT -U $env:DB_USER -d $env:DB_NAME -c "SELECT user_id,balance FROM wallets ORDER BY user_id LIMIT 20"
psql -h $env:DB_HOST -p $env:DB_PORT -U $env:DB_USER -d $env:DB_NAME -c "SELECT id,event_id,seat_number,price,status FROM seats ORDER BY event_id,id LIMIT 20"
psql -h $env:DB_HOST -p $env:DB_PORT -U $env:DB_USER -d $env:DB_NAME -c "SELECT id,user_id,event_id,seat_id,status,booking_date FROM bookings ORDER BY id DESC LIMIT 20"
psql -h $env:DB_HOST -p $env:DB_PORT -U $env:DB_USER -d $env:DB_NAME -c "SELECT id,wallet_id,amount,transaction_type,transaction_date FROM wallet_transactions ORDER BY id DESC LIMIT 20"

# Redis is optional; these commands inspect the service only, not app TTL keys
redis-cli -h 127.0.0.1 -p 6379 PING
redis-cli -h 127.0.0.1 -p 6379 INFO server
```

`redis-cli TTL <key>` has no APEXMATCH key to inspect today: the app does not write Redis keys or assign TTLs. RabbitMQ commands and queue debugging are not applicable because no RabbitMQ publisher/worker exists.

## Public Showcase

### Implemented

- Ticket booking with an authenticated user identity and PostgreSQL as source of truth.
- Price lookup before purchase.
- PostgreSQL row locking and unique seat constraint; booking, wallet debit, debit ledger row, and seat status change commit together.
- bcrypt password storage, JWT access tokens, role-based admin authorization, and auth endpoint rate limits.
- Admin endpoints for request-derived booking metrics, recent audit records, bookings/users, PostgreSQL blocking locks, and DB/optional Redis health.
- Structured request audit logs and `x-request-id` response header.

### Tested

- Ten current `node --test` cases passed. They include mocked auth and booking services plus in-process HTTP access checks.
- Real PostgreSQL/API concurrency proof: 100 same-seat requests produced 1 success and 99 rejections, with one booking row. This is a correctness test, not a throughput benchmark.

### Incomplete / Not Tested

- Admin endpoint success paths and most query-validation branches have no dedicated automated integration coverage.
- Demo wallet top-up is not a payment provider. There is no refresh token, logout/revocation mechanism, or per-user session invalidation.
- Audit insert happens asynchronously after the response; audit loss is logged but is not transactional with booking.
- Rate limiting uses the default in-memory store; it is not shared across instances.
- Production deployment, load testing at planned scale, uptime/SLO, and latency targets have not been established.
- npm audit could not reach the registry in this run, so dependency advisories are unverified here.

### Planned / Not Implemented

- Idempotency keys, Redis cache/TTL, and Redis-backed duplicate-request protection.
- RabbitMQ event publishing, workers, retries, dead-letter queues, or an outbox.
- MongoDB audit store, WebSockets, Docker Compose, deployment, and measured high-volume load tests.
- MySQL is not the current database; use PostgreSQL terminology for the live implementation.

**Showcase readiness:** suitable for a local technical demo with the limitations above. It is not yet ready to be presented as a deployed, production-grade ticketing/payment platform.

## Final Report

- **Implemented API endpoints:** 13.
- **Automated unit/HTTP tests:** 10 passed, 0 failed in the current run.
- **Live concurrency:** passed; 1 successful booking, 99 rejected, one booking persisted; test fixture cleanup is implemented.
- **Blocked checks:** npm dependency audit due registry DNS; Redis TTL/cache tests and RabbitMQ tests because those features do not exist; admin success-path integration tests and broader malformed-input tests because the existing suite does not cover them.
- **Confirmed issue/fix in this inspection:** no code behavior was changed for this documentation task. The guide corrects the mismatch between the roadmap's MySQL/Redis/RabbitMQ stack and the actual PostgreSQL implementation; it does not describe planned components as working.
- **Commands:** from `APEXMATCH Backend/apps/ticket-booking`, run `npm start`, `npm test`, and (with API running plus at least 100 seeded users) `npm run test:concurrency`.
- **Public demo readiness:** local demo ready with configured JWT secret and PostgreSQL; not production/public deployment ready. Real payments, idempotency/Redis, async queue/outbox, broader integration testing, deployment, and a reachable dependency audit remain.
