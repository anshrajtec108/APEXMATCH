import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

const connectDB = new Pool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 5432),
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'ticket_booking',
  max: 10
});

connectDB.connect()
  .then(client => {
    console.log('PostgreSQL connected');
    client.release();
  })
  .catch(error => {
    console.error('PostgreSQL connection failed:', error.message);
  });

export default connectDB;