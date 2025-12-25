/*
 * ============================================
 * DATABASE RESET - SUPABASE SQL
 * ============================================
 * COPY THIS ENTIRE FILE AND RUN IN SUPABASE SQL EDITOR
 * This will delete ALL old tables and create fresh ones
 */

-- ============================================
-- STEP 1: DROP ALL OLD TABLES & EXTENSIONS
-- ============================================
-- WARNING: This removes PostGIS support if you don't need advanced geo-queries
DROP EXTENSION IF EXISTS postgis CASCADE;

DROP TABLE IF EXISTS gps_logs CASCADE;
DROP TABLE IF EXISTS gsm_logs CASCADE;
DROP TABLE IF EXISTS sms_inbox CASCADE;
DROP TABLE IF EXISTS device_tokens CASCADE;
DROP TABLE IF EXISTS tracking_history CASCADE;
DROP TABLE IF EXISTS device_routes CASCADE;

-- ============================================
-- STEP 2: CREATE NEW TABLES
-- ============================================

-- 1. GPS LOGS TABLE (Main tracking data)
-- ============================================
CREATE TABLE gps_logs (
  id BIGSERIAL PRIMARY KEY,
  device_id TEXT NOT NULL,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  speed DOUBLE PRECISION DEFAULT 0,
  battery DOUBLE PRECISION DEFAULT 4.0,
  signal INTEGER DEFAULT 0,
  hdop DOUBLE PRECISION,
  satellites INTEGER DEFAULT 0,
  source TEXT DEFAULT 'gps',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_gps_device_time ON gps_logs(device_id, created_at DESC);
CREATE INDEX idx_gps_created_at ON gps_logs(created_at DESC);

-- ============================================
-- 2. GSM LOGS TABLE (Backup - kept for compatibility)
-- ============================================
CREATE TABLE gsm_logs (
  id BIGSERIAL PRIMARY KEY,
  device_id TEXT NOT NULL,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  accuracy DOUBLE PRECISION DEFAULT 500,
  battery DOUBLE PRECISION DEFAULT 4.0,
  signal INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_gsm_device_time ON gsm_logs(device_id, created_at DESC);

-- ============================================
-- 3. SMS INBOX TABLE
-- ============================================
CREATE TABLE sms_inbox (
  id BIGSERIAL PRIMARY KEY,
  device_id TEXT NOT NULL,
  sender TEXT NOT NULL,
  message TEXT,
  received_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for performance
CREATE INDEX idx_sms_received ON sms_inbox(received_at DESC);

-- ============================================
-- 4. DEVICE TOKENS TABLE (Push notifications)
-- ============================================
CREATE TABLE device_tokens (
  id BIGSERIAL PRIMARY KEY,
  device_id TEXT UNIQUE NOT NULL,
  token TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for performance
CREATE INDEX idx_device_tokens_device ON device_tokens(device_id);

-- ============================================
-- ENABLE ROW LEVEL SECURITY (RLS)
-- ============================================
-- This secures your data so only authorized users (or the backend) can access it.

ALTER TABLE gps_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE gsm_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE sms_inbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE device_tokens ENABLE ROW LEVEL SECURITY;

-- ============================================
-- RLS POLICIES (Access Rules)
-- ============================================
-- These policies allow the backend (and public for now) to read/write.
-- Without these, enabling RLS would lock the database completely.

CREATE POLICY "Enable all access for gps_logs" ON gps_logs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable all access for gsm_logs" ON gsm_logs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable all access for sms_inbox" ON sms_inbox FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable all access for device_tokens" ON device_tokens FOR ALL USING (true) WITH CHECK (true);

-- ============================================
-- SUCCESS MESSAGE
-- ============================================
SELECT 'Database schema created successfully!' as status;
