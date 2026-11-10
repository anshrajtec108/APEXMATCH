# APEXMATCH

### Distributed High-Throughput Matching Engine & Asset Ledger

APEXMATCH is a practical backend engineering project focused on building
systems that can handle high concurrency, duplicate requests, fast in-memory
processing, asynchronous workloads, and reliable persistent data.

Instead of building one simple application, APEXMATCH explores the same
engineering principles through multiple real-world use cases.

---

## 🚀 What Am I Building?

APEXMATCH is being developed as a collection of backend systems built around
high-throughput request processing and matching-engine concepts.

The project currently includes four planned use cases:

### Option A — Flash Ticket Booking
A high-demand ticket booking system where many users may try to reserve
the same seat at the same time.

The current backend includes:

- PostgreSQL transactions and row-level locking for seat and wallet updates
- User registration, bcrypt password hashes, JWT authentication, and role authorization
- Wallet balances, ticket-price lookup, and atomic ticket purchase
- Admin booking metrics, request audit logs, service health, and lock inspection
- A 100-request concurrency proof (one booking succeeds; 99 requests are rejected)

Redis idempotency/cache behavior and RabbitMQ-based background processing remain planned work. PostgreSQL is the current source of truth; Redis and RabbitMQ are not required for booking correctness.

### Option B — Financial / Crypto Exchange
A matching system for buy and sell orders using an in-memory order book
and matching engine.

### Option C — On-Demand Surge Matching
A system for matching supply and demand dynamically, such as ride or
delivery requests during high-demand periods.

### Option D — Limited-Drop E-Commerce
A high-concurrency system for limited-stock products where thousands of
users may attempt to purchase the same item simultaneously.

---

# 🏗️ Architecture

The overall architecture is designed around separating the fast
request/matching path from slower persistent and asynchronous operations.

```text
                    CLIENT
                      │
                      ▼
                Node.js API
                      │
          ┌───────────┴───────────┐
          │                       │
          ▼                       ▼
         Express API
               │
               ▼
         PostgreSQL
   bookings / wallets / audit
               │
        ┌─────┴─────┐
        ▼           ▼
  Admin APIs   Optional Redis
  metrics and   future cache /
  lock status   idempotency