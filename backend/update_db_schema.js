const { Client } = require('pg');
require('dotenv').config();

// Parse the connection string from .env or construct it
// Since we have SUPABASE_URL and SUPABASE_KEY in .env, but we need the direct Postgres connection string
// We will use the one you provided earlier:
// postgresql://postgres.ugsaejlogfychombnhgf:Papaji@gps1@aws-1-ap-south-1.pooler.supabase.com:6543/postgres

const connectionString = 'postgresql://postgres.ugsaejlogfychombnhgf:Papaji%40gps1@aws-1-ap-south-1.pooler.supabase.com:6543/postgres';

const client = new Client({
  connectionString: connectionString,
  ssl: { rejectUnauthorized: false }
});

async function updateSchema() {
  try {
    console.log('Connecting to Supabase Database...');
    await client.connect();
    console.log('Connected!');

    console.log('Creating "device_routes" table for Pro Features...');
    
    // SQL command to create the new table
    await client.query(`
      create table if not exists device_routes (
        device_id text primary key,
        route_data jsonb, 
        max_speed float,
        updated_at timestamp with time zone default timezone('utc'::text, now())
      );
      
      -- Enable Realtime for this table
      alter publication supabase_realtime add table device_routes;
    `);

    console.log('✅ SUCCESS: Table "device_routes" created and Realtime enabled!');

  } catch (err) {
    console.error('❌ ERROR:', err.message);
  } finally {
    await client.end();
  }
}

updateSchema();
