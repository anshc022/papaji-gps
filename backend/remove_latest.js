const supabase = require('./supabase');

async function removeLatest() {
  console.log("Removing the latest fake data point...");

  // 1. Get the ID of the latest point
  const { data, error } = await supabase
    .from('tracking_history')
    .select('id')
    .eq('device_id', 'papaji_tractor_01')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (error || !data) {
    console.error('Error finding latest point:', error);
    return;
  }

  console.log(`Deleting point with ID: ${data.id}`);

  // 2. Delete it
  const { error: delError } = await supabase
    .from('tracking_history')
    .delete()
    .eq('id', data.id);

  if (delError) {
    console.error('Error deleting:', delError);
  } else {
    console.log('Success! Fake point removed. App will show previous real location.');
  }
}

removeLatest();