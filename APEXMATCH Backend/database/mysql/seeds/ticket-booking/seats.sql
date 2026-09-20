INSERT INTO seats (event_id, seat_number, price)
SELECT events.id, 'S' || seat_number, 100.00
FROM events
CROSS JOIN generate_series(1, 10) AS seat_number
WHERE events.name IN ('Previous Demo Match', 'Apex Match Demo')
ON CONFLICT (event_id, seat_number) DO NOTHING;
