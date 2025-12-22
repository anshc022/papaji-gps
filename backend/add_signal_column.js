const { Client } = require('pg');
require('dotenv').config();

const client = new Client({
  user: 'postgres',
  host: 'db.ugsaejlogfychombnhgf.supabase.co',
  database: 'postgres',
  password: 'Papaji@gps1',
  port: 5432,
  ssl: { rejectUnauthorized: false }
});

async function addSignalColumn() {
  try {
    await client.connect();
    console.log('Connected to DB');

    await client.query(`
      ALTER TABLE tracking_history 
      ADD COLUMN IF NOT EXISTS signal int DEFAULT 0;
    `);
    
    await client.query(`
      ALTER TABLE tracking_history 
      ADD COLUMN IF NOT EXISTS source text DEFAULT 'gps';
    `);

    console.log('Added signal and source columns');
  } catch (e) {
    console.error('Error:', e);
  } finally {
    await client.end();
  }
}

addSignalColumn();
