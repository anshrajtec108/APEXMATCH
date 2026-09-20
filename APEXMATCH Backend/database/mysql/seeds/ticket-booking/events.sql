INSERT INTO events (name, event_type, description, starts_at, location, status)
VALUES
('Previous Demo Match', 'sports', 'An existing event for testing history', '2026-09-01 19:00:00', 'Demo Stadium', 'closed'),
('Apex Match Demo', 'sports', 'A new event for booking tests', '2027-01-15 19:00:00', 'Demo Stadium', 'published')
ON CONFLICT (name, starts_at) DO NOTHING;
