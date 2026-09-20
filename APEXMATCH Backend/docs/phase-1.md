Phase 1 — “Database & Concurrency Core”
Project structure created
Node.js project initialized
MySQL database created
Users schema
Events schema
Seats schema
Bookings schema
Wallet/transaction schema
Node.js successfully connects to MySQL
Basic booking function works
Transaction implemented with BEGIN / COMMIT / ROLLBACK
SELECT ... FOR UPDATE implemented
Deliberately test a race condition
Create a concurrency test with many requests hitting the same seat
Prove the result:
100 attempts
1 successful booking
99 rejected
0 duplicate bookings
Add the database UNIQUE constraint as the final protection.
Write a short README explaining why the race condition happens and how you solved it.
Make a Git commit.