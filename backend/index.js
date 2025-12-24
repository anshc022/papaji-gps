/**
 * ============================================
 * PAPAJI GPS TRACKER - BACKEND v2.0 (CLEAN)
 * ============================================
 * 
 * REST API Server for GPS Tracking
 * Features:
 *   - Real-time telemetry from ESP32
 *   - GPS/GSM location history
 *   - SMS inbox logging
 *   - Admin controls (reset, reconnect)
 *   - Stop detection
 */

// ============================================
// IMPORTS
// ============================================
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

// ============================================
// CONFIGURATION
// ============================================
const PORT = process.env.PORT || 3000;

const SUPABASE_URL = 'https://xjcnzqfrcqbxzvlpwqhm.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhqY256cWZyY3FieHp2bHB3cWhtIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0OTE5NjQ1NywiZXhwIjoyMDY0NzcyNDU3fQ.shBxlRjdYDI3n6RKmqA_K62WrLkQ8SWJYSfVIvmJ0Mk';

// Stop detection settings
const STOP_RADIUS_METERS = 50;
const MIN_STOP_DURATION_MS = 5 * 60 * 1000; // 5 minutes

// ============================================
// INITIALIZATION
// ============================================
const app = express();
app.use(cors());
app.use(express.json());

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// In-memory state
const serverLogs = [];
let pendingCommand = null;
let lastLocation = { lat: 0, lon: 0, timestamp: Date.now() };

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Add log message to in-memory logs
 */
function log(type, message, data = null) {
  const entry = {
    timestamp: new Date().toISOString(),
    type,
    message,
    data
  };
  serverLogs.push(entry);
  
  // Keep only last 200 logs
  while (serverLogs.length > 200) {
    serverLogs.shift();
  }
  
  console.log(`[${type.toUpperCase()}] ${message}`, data ? JSON.stringify(data) : '');
}

/**
 * Calculate distance between two coordinates in meters
 */
function calculateDistance(lat1, lon1, lat2, lon2) {
  if (!lat1 || !lon1 || !lat2 || !lon2) return 0;
  
  const R = 6371e3; // Earth radius in meters
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;
  
  const a = Math.sin(Δφ / 2) ** 2 + 
            Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  
  return R * c;
}

/**
 * Detect stops in GPS data
 */
function detectStops(points) {
  const stops = [];
  if (points.length < 2) return stops;
  
  let stopStart = null;
  let stopLat = 0, stopLon = 0;
  
  for (let i = 0; i < points.length; i++) {
    const point = points[i];
    const lat = parseFloat(point.latitude);
    const lon = parseFloat(point.longitude);
    const speed = parseFloat(point.speed_kmh || 0);
    
    if (speed < 2) { // Stationary
      if (!stopStart) {
        stopStart = new Date(point.created_at || point.timestamp);
        stopLat = lat;
        stopLon = lon;
      }
    } else {
      // Moving - check if previous stop was long enough
      if (stopStart) {
        const stopEnd = new Date(point.created_at || point.timestamp);
        const duration = stopEnd - stopStart;
        
        if (duration >= MIN_STOP_DURATION_MS) {
          stops.push({
            latitude: stopLat,
            longitude: stopLon,
            start_time: stopStart.toISOString(),
            end_time: stopEnd.toISOString(),
            duration_minutes: Math.round(duration / 60000)
          });
        }
      }
      stopStart = null;
    }
  }
  
  // Handle ongoing stop
  if (stopStart) {
    const duration = Date.now() - stopStart;
    if (duration >= MIN_STOP_DURATION_MS) {
      stops.push({
        latitude: stopLat,
        longitude: stopLon,
        start_time: stopStart.toISOString(),
        end_time: null,
        duration_minutes: Math.round(duration / 60000),
        ongoing: true
      });
    }
  }
  
  return stops;
}

// ============================================
// ROUTES: HEALTH & STATUS
// ============================================

app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    service: 'Papaji GPS Tracker API',
    version: '2.0',
    timestamp: new Date().toISOString()
  });
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// ============================================
// ROUTES: TELEMETRY
// ============================================

/**
 * POST /api/telemetry
 * Receive GPS/GSM data from ESP32
 */
app.post('/api/telemetry', async (req, res) => {
  try {
    const data = req.body;
    const points = Array.isArray(data) ? data : [data];
    
    log('telemetry', `Received ${points.length} point(s)`, { source: points[0]?.source });
    
    for (const point of points) {
      const record = {
        device_id: point.device_id || 'unknown',
        latitude: parseFloat(point.latitude),
        longitude: parseFloat(point.longitude),
        speed_kmh: parseFloat(point.speed_kmh || 0),
        signal: parseInt(point.signal || 0),
        battery_voltage: parseFloat(point.battery_voltage || 0),
        source: point.source || 'gps',
        hdop: parseFloat(point.hdop || 99),
        satellites: parseInt(point.satellites || 0),
        // Use device timestamp if provided, otherwise use server time
        created_at: point.timestamp || new Date().toISOString()
      };
      
      // Store in appropriate table
      const table = record.source === 'gsm' ? 'gsm_logs' : 'gps_logs';
      const { error } = await supabase.from(table).insert([record]);
      
      if (error) {
        log('error', `DB insert failed: ${error.message}`);
      } else {
        lastLocation = { lat: record.latitude, lon: record.longitude, timestamp: Date.now() };
      }
    }
    
    // Return pending command if any
    if (pendingCommand) {
      const cmd = pendingCommand;
      pendingCommand = null;
      log('command', `Sending command: ${cmd}`);
      return res.json({ status: 'ok', command: cmd });
    }
    
    res.json({ status: 'ok' });
    
  } catch (error) {
    log('error', `Telemetry error: ${error.message}`);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================
// ROUTES: DATA RETRIEVAL
// ============================================

/**
 * GET /api/latest
 * Get most recent GPS location
 */
app.get('/api/latest', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('gps_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1);
    
    if (error) throw error;
    res.json(data?.[0] || null);
    
  } catch (error) {
    log('error', `Latest fetch error: ${error.message}`);
    res.status(500).json({ error: 'Failed to fetch latest data' });
  }
});

/**
 * GET /api/history
 * Get GPS/GSM history for a time range
 */
app.get('/api/history', async (req, res) => {
  try {
    const hours = parseInt(req.query.hours || 24);
    const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
    
    // Fetch GPS and GSM data in parallel
    const [gpsResult, gsmResult] = await Promise.all([
      supabase
        .from('gps_logs')
        .select('*')
        .gte('created_at', since)
        .order('created_at', { ascending: true }),
      supabase
        .from('gsm_logs')
        .select('*')
        .gte('created_at', since)
        .order('created_at', { ascending: true })
    ]);
    
    if (gpsResult.error) throw gpsResult.error;
    if (gsmResult.error) throw gsmResult.error;
    
    // Combine and sort
    const combined = [
      ...(gpsResult.data || []).map(p => ({ ...p, source: 'gps' })),
      ...(gsmResult.data || []).map(p => ({ ...p, source: 'gsm' }))
    ].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    
    res.json(combined);
    
  } catch (error) {
    log('error', `History fetch error: ${error.message}`);
    res.status(500).json({ error: 'Failed to fetch history' });
  }
});

/**
 * GET /api/stats
 * Get today's statistics
 */
app.get('/api/stats', async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const { data, error } = await supabase
      .from('gps_logs')
      .select('*')
      .gte('created_at', today.toISOString())
      .order('created_at', { ascending: true });
    
    if (error) throw error;
    
    const points = data || [];
    
    // Calculate distance
    let totalDistance = 0;
    for (let i = 1; i < points.length; i++) {
      const dist = calculateDistance(
        points[i - 1].latitude, points[i - 1].longitude,
        points[i].latitude, points[i].longitude
      );
      if (dist < 5000) { // Ignore teleports > 5km
        totalDistance += dist;
      }
    }
    
    // Calculate other stats
    const speeds = points.map(p => parseFloat(p.speed_kmh || 0)).filter(s => s > 0);
    const maxSpeed = speeds.length > 0 ? Math.max(...speeds) : 0;
    const avgSpeed = speeds.length > 0 ? speeds.reduce((a, b) => a + b, 0) / speeds.length : 0;
    
    // Detect stops
    const stops = detectStops(points);
    
    // Calculate active time
    const movingPoints = points.filter(p => parseFloat(p.speed_kmh || 0) >= 2);
    let activeTime = 0;
    for (let i = 1; i < movingPoints.length; i++) {
      const gap = new Date(movingPoints[i].created_at) - new Date(movingPoints[i - 1].created_at);
      if (gap < 5 * 60 * 1000) { // Gaps < 5 min count as active
        activeTime += gap;
      }
    }
    
    res.json({
      distance_km: (totalDistance / 1000).toFixed(2),
      max_speed_kmh: maxSpeed.toFixed(1),
      avg_speed_kmh: avgSpeed.toFixed(1),
      active_time_hours: (activeTime / 3600000).toFixed(1),
      data_points: points.length,
      stops: stops,
      last_update: points.length > 0 ? points[points.length - 1].created_at : null
    });
    
  } catch (error) {
    log('error', `Stats error: ${error.message}`);
    res.status(500).json({ error: 'Failed to calculate stats' });
  }
});

/**
 * GET /api/stops
 * Get stop locations for a time period
 */
app.get('/api/stops', async (req, res) => {
  try {
    const hours = parseInt(req.query.hours || 24);
    const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
    
    const { data, error } = await supabase
      .from('gps_logs')
      .select('*')
      .gte('created_at', since)
      .order('created_at', { ascending: true });
    
    if (error) throw error;
    
    const stops = detectStops(data || []);
    res.json(stops);
    
  } catch (error) {
    log('error', `Stops error: ${error.message}`);
    res.status(500).json({ error: 'Failed to detect stops' });
  }
});

// ============================================
// ROUTES: SMS
// ============================================

/**
 * POST /api/sms/incoming
 * Receive SMS forwarded from ESP32
 */
app.post('/api/sms/incoming', async (req, res) => {
  try {
    const { device_id, raw_response } = req.body;
    
    log('sms', 'Incoming SMS', { device_id });
    
    // Parse SMS data
    let sender = 'unknown';
    let message = '';
    
    const cmglMatch = raw_response.match(/\+CMGL:\s*\d+,"[^"]*","([^"]+)"/i);
    if (cmglMatch) {
      sender = cmglMatch[1];
    }
    
    // Extract message body (after the last \n in header)
    const lines = raw_response.split('\n');
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i].trim();
      if (line && !line.startsWith('+') && !line.startsWith('OK')) {
        message = line;
        break;
      }
    }
    
    // Store in database
    const { error } = await supabase.from('sms_inbox').insert([{
      device_id,
      sender,
      message,
      raw_response,
      received_at: new Date().toISOString()
    }]);
    
    if (error) throw error;
    
    res.json({ status: 'ok', sender, message });
    
  } catch (error) {
    log('error', `SMS error: ${error.message}`);
    res.status(500).json({ error: 'Failed to process SMS' });
  }
});

/**
 * GET /api/admin/sms
 * Get SMS inbox
 */
app.get('/api/admin/sms', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit || 50);
    
    const { data, error } = await supabase
      .from('sms_inbox')
      .select('*')
      .order('received_at', { ascending: false })
      .limit(limit);
    
    if (error) throw error;
    res.json(data || []);
    
  } catch (error) {
    log('error', `SMS fetch error: ${error.message}`);
    res.status(500).json({ error: 'Failed to fetch SMS' });
  }
});

// ============================================
// ROUTES: ADMIN CONTROLS
// ============================================

/**
 * POST /api/admin/reset-device
 * Queue reset command for device
 */
app.post('/api/admin/reset-device', async (req, res) => {
  try {
    const { type } = req.body;
    
    if (type === 'hard') {
      pendingCommand = 'reset';
      log('admin', 'Hard reset queued');
    } else if (type === 'soft') {
      pendingCommand = 'reconnect';
      log('admin', 'Soft reset (reconnect) queued');
    } else {
      return res.status(400).json({ error: 'Invalid reset type. Use "hard" or "soft".' });
    }
    
    res.json({ success: true, message: `${type} reset queued` });
    
  } catch (error) {
    log('error', `Reset error: ${error.message}`);
    res.status(500).json({ error: 'Failed to queue reset' });
  }
});

/**
 * GET /api/admin/logs
 * Get server logs
 */
app.get('/api/admin/logs', (req, res) => {
  const limit = parseInt(req.query.limit || 100);
  res.json(serverLogs.slice(-limit));
});

/**
 * POST /api/admin/clear-logs
 * Clear server logs
 */
app.post('/api/admin/clear-logs', (req, res) => {
  serverLogs.length = 0;
  log('admin', 'Logs cleared');
  res.json({ success: true });
});

/**
 * DELETE /api/admin/data
 * Clear all GPS/GSM data
 */
app.delete('/api/admin/data', async (req, res) => {
  try {
    await Promise.all([
      supabase.from('gps_logs').delete().neq('id', 0),
      supabase.from('gsm_logs').delete().neq('id', 0)
    ]);
    
    log('admin', 'All data cleared');
    res.json({ success: true });
    
  } catch (error) {
    log('error', `Clear data error: ${error.message}`);
    res.status(500).json({ error: 'Failed to clear data' });
  }
});

// ============================================
// START SERVER
// ============================================
app.listen(PORT, '0.0.0.0', () => {
  console.log('============================================');
  console.log(`  PAPAJI GPS TRACKER - BACKEND v2.0`);
  console.log(`  Running on port ${PORT}`);
  console.log('============================================');
  log('server', `Server started on port ${PORT}`);
});
