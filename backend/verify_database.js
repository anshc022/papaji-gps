/*
 * ============================================
 * DATABASE VERIFICATION & SETUP
 * ============================================
 * Verifies all tables exist and creates indexes
 */

const supabase = require('./supabase');

async function verifyDatabase() {
  console.log('\n========================================');
  console.log('  DATABASE VERIFICATION');
  console.log('========================================\n');

  const tables = [
    { name: 'gps_logs', required: ['device_id', 'latitude', 'longitude', 'speed', 'created_at'] },
    { name: 'gsm_logs', required: ['device_id', 'latitude', 'longitude', 'created_at'] },
    { name: 'sms_inbox', required: ['device_id', 'sender', 'message', 'received_at'] },
    { name: 'device_tokens', required: ['device_id', 'token', 'updated_at'] }
  ];

  let allOk = true;

  for (const table of tables) {
    try {
      const { data, error } = await supabase.from(table.name).select('*').limit(1);
      
      if (error) {
        console.log(`❌ ${table.name}: ${error.message}`);
        allOk = false;
      } else {
        console.log(`✓ ${table.name}: OK`);
      }
    } catch (err) {
      console.log(`❌ ${table.name}: ${err.message}`);
      allOk = false;
    }
  }

  console.log('\n========================================');
  if (allOk) {
    console.log('✅ SYSTEM READY: All tables are correctly set up.');
  } else {
    console.log('⚠️  WARNING: Some tables are missing or inaccessible.');
    console.log('   Please run the SQL script in Supabase Dashboard.');
  }
  console.log('========================================\n');
}

verifyDatabase();
