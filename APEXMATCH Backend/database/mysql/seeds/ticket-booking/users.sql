INSERT INTO users (username, email, password_hash) VALUES
('user01', 'user01@example.com', 'phase1-user01-password'),
('user02', 'user02@example.com', 'phase1-user02-password'),
('user03', 'user03@example.com', 'phase1-user03-password'),
('user04', 'user04@example.com', 'phase1-user04-password'),
('user05', 'user05@example.com', 'phase1-user05-password'),
('user06', 'user06@example.com', 'phase1-user06-password'),
('user07', 'user07@example.com', 'phase1-user07-password'),
('user08', 'user08@example.com', 'phase1-user08-password'),
('user09', 'user09@example.com', 'phase1-user09-password'),
('user10', 'user10@example.com', 'phase1-user10-password')
ON CONFLICT (email) DO NOTHING;