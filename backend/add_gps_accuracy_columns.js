// Run this script to add hdop and satellites columns to tracking_history
// Command: node add_gps_accuracy_columns.js

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://ryaviweiitctmusvsiqs.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ5YXZpd2VpaXRjdG11c3ZzaXFzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDk3NjQyMDksImV4cCI6MjA2NTM0MDIwOX0.J_kaFKO0wIdLeyByBHc7Cnudq8WNPu70BXSZ9JinL2Q'
);

console.log(`
===================================================
ADD THESE COLUMNS IN SUPABASE SQL EDITOR:
===================================================

ALTER TABLE tracking_history 
ADD COLUMN IF NOT EXISTS hdop FLOAT DEFAULT NULL;

ALTER TABLE tracking_history 
ADD COLUMN IF NOT EXISTS satellites INTEGER DEFAULT 0;

COMMENT ON COLUMN tracking_history.hdop IS 'GPS Horizontal Dilution of Precision (lower = better, <2 = excellent)';
COMMENT ON COLUMN tracking_history.satellites IS 'Number of satellites used for GPS fix';

===================================================
`);

console.log('Open: https://supabase.com/dashboard/project/ryaviweiitctmusvsiqs/sql/new');
console.log('Paste the SQL above and run it.\n');
