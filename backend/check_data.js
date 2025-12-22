const supabase = require('./supabase');

async function checkData() {
  const { data, error } = await supabase
    .from('tracking_history')
    .select('*')
    .eq('device_id', 'papaji_tractor_01')
    .order('created_at', { ascending: false })
    .limit(5);

  if (error) {
    console.error('Error:', error);
  } else {
    console.log(`Found ${data.length} rows for papaji_tractor_01.`);
    if (data.length > 0) {
      console.log('Latest point:', data[0]);
    } else {
      console.log('No data found. The app will show default mock location until data arrives.');
    }
  }
}

checkData();
