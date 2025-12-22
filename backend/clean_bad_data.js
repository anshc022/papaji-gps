const supabase = require('./supabase');

async function cleanBadData() {
  // Delete rows where year is 1970
  const { count, error } = await supabase
    .from('tracking_history')
    .delete({ count: 'exact' })
    .lt('created_at', '2020-01-01T00:00:00');

  if (error) {
    console.error('Error cleaning bad data:', error);
  } else {
    console.log(`Deleted ${count} rows with invalid timestamps (1970s).`);
  }
}

cleanBadData();
