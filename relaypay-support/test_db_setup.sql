-- Run this in your Supabase SQL Editor
ALTER TABLE call_history ADD COLUMN is_test BOOLEAN DEFAULT false;
ALTER TABLE escalations ADD COLUMN is_test BOOLEAN DEFAULT false;
