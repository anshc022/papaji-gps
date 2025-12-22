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
    
    const { count } = await supabase
      .from('tracking_history')
      .select('*', { count: 'exact', head: true })
      .eq('device_id', 'papaji_tractor_01');
    console.log(`Total count in DB: ${count}`);

    data.forEach((row, index) => {
        console.log(`[${index}] Time: ${row.created_at} | Lat: ${row.latitude}, Lon: ${row.longitude} | Source: ${row.source}`);
    });
  }
}

checkData();
