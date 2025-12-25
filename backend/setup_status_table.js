const supabase = require('./supabase');

async function setupStatusTable() {
  console.log('Setting up device_status table...');

  const sql = `
    CREATE TABLE IF NOT EXISTS device_status (
      device_id text PRIMARY KEY,
      last_seen timestamptz DEFAULT now(),
      last_ip text,
      metadata jsonb DEFAULT '{}'::jsonb
    );
  `;

  const { error } = await supabase.rpc('exec_sql', { sql_query: sql });
  
  // If RPC fails (often disabled), try direct query if possible or just log instruction
  if (error) {
      console.log('RPC exec_sql failed (expected if not enabled). Trying to use standard client...');
      // Supabase JS client doesn't support raw SQL easily without RPC.
      // We will assume the user might need to run this SQL manually if this fails.
      console.error('Error creating table:', error);
      console.log('\nPlease run this SQL in Supabase SQL Editor:');
      console.log(sql);
  } else {
      console.log('Table device_status created successfully!');
  }
}

setupStatusTable();
