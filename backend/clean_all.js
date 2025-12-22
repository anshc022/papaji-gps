const supabase = require('./supabase');

async function cleanAll() {
  const { count, error } = await supabase
    .from('tracking_history')
    .delete({ count: 'exact' })
    .eq('device_id', 'papaji_tractor_01');

  if (error) {
    console.error('Error:', error);
  } else {
    console.log(`Deleted ${count} rows for papaji_tractor_01.`);
  }
}

cleanAll();
