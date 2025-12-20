
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase URL or Key in .env file');
  // We don't exit here to allow the server to start, but DB calls will fail
}

const supabase = createClient(supabaseUrl, supabaseKey);

module.exports = supabase;
