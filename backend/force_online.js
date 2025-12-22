const supabase = require('./supabase');

async function forceOnline() {
  console.log("Forcing device 'papaji_tractor_01' to ONLINE state...");

  const { error } = await supabase.from('tracking_history').insert([
    {
      device_id: 'papaji_tractor_01',
      latitude: 30.7333, // Chandigarh
      longitude: 76.7794,
      speed: 0,
      battery: 100,
      source: 'gps',
      signal: 31,
      created_at: new Date().toISOString()
    }
  ]);

  if (error) {
    console.error('Error:', error.message);
  } else {
    console.log('Success! Added a fresh data point. The app should now show "Online".');
  }
}

forceOnline();