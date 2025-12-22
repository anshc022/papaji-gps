const supabase = require('./supabase');

async function cleanAll() {
  console.log("Fetching latest 5 IDs...");
  const { data } = await supabase
    .from('tracking_history')
    .select('id')
    .order('created_at', { ascending: false })
    .limit(5);
  
  for (const row of data) {
      console.log(`Deleting ID ${row.id}...`);
      const { error, count } = await supabase.from('tracking_history').delete({ count: 'exact' }).eq('id', row.id);
      if (error) console.log(error);
      else console.log(`Deleted: ${count}`);
  }
}

cleanAll();
