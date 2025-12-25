const express = require('express');
const cors = require('cors');
const supabase = require('./supabase');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// In-memory state for alerts
const deviceState = {}; 
// In-memory commands queue
const deviceCommands = {};

// In-memory logs (last 100)
const serverLogs = [];
const MAX_LOGS = 100;

function addLog(type, message) {
  const entry = {
    time: new Date().toISOString(),
    type: type,
    message: message
  };
  serverLogs.unshift(entry);
  if (serverLogs.length > MAX_LOGS) serverLogs.pop();
  console.log(`[${type}] ${message}`);
}

// Middleware
app.use(cors());
app.use(express.json());

async function getBestLatestPoint(deviceId, opts = {}) {
  // GPS PRIORITY: When GPS is fresh (within 2 mins), always prefer GPS over GSM
  // GPS is more accurate, so we want to switch to it immediately when available
  
  // 1. Get Latest GPS
  const { data: lastGpsData } = await supabase
    .from('gps_logs')
    .select('*')
    .eq('device_id', deviceId)
    .order('created_at', { ascending: false })
    .limit(1);
  const lastGps = (lastGpsData && lastGpsData.length > 0) ? lastGpsData[0] : null;

  // 2. Get Latest GSM
  const { data: lastGsmData } = await supabase
    .from('gsm_logs')
    .select('*')
    .eq('device_id', deviceId)
    .order('created_at', { ascending: false })
    .limit(1);
  const lastGsm = (lastGsmData && lastGsmData.length > 0) ? lastGsmData[0] : null;

  if (!lastGps && !lastGsm) return { error: null, chosen: null, decision: 'no_data' };

  // Normalize objects for the app
  if (lastGps) lastGps.source = 'gps';
  if (lastGsm) lastGsm.source = 'gsm';

  // Decision Logic
  if (!lastGps) return { error: null, chosen: lastGsm, decision: 'only_gsm' };
  if (!lastGsm) return { error: null, chosen: lastGps, decision: 'only_gps' };

  const now = Date.now();
  const gpsTime = new Date(lastGps.created_at).getTime();
  const gsmTime = new Date(lastGsm.created_at).getTime();
  
  // STRICTER GPS PRIORITY:
  // Only prefer GPS if it is VERY fresh (within 1 minute)
  // Otherwise, if GSM is newer, show GSM immediately.
  const gpsAgeMinutes = (now - gpsTime) / 60000;
  
  if (gpsAgeMinutes <= 1 && gpsTime >= gsmTime) {
    return { error: null, chosen: lastGps, decision: 'gps_fresh_priority' };
  }
  
  // If GSM is newer (even by a second), use GSM
  if (gsmTime > gpsTime) {
    return { error: null, chosen: lastGsm, decision: 'gsm_newer' };
  }
  
  // Fallback to GPS
  return { error: null, chosen: lastGps, decision: 'gps_default' };
}

// --- 0. Register Token Endpoint ---
app.post('/api/register-token', async (req, res) => {
  const { device_id, token } = req.body;
  if (!device_id || !token) return res.status(400).send('Missing data');

  const { error } = await supabase
    .from('device_tokens')
    .upsert({ device_id, token, updated_at: new Date() });

  if (error) return res.status(500).send(error.message);
  res.send('Token registered');
});

// --- 1. Telemetry Endpoint (For ESP32) ---
// POST /api/telemetry
app.post('/api/telemetry', async (req, res) => {
  try {
    const body = req.body;
    let points = Array.isArray(body) ? body : [body];

    if (points.length === 0) return res.status(400).send('ERR: No Data');

    const gpsRows = [];
    const gsmRows = [];

    // Helper to calculate distance between two points in meters
    const getDistanceMeters = (lat1, lon1, lat2, lon2) => {
      const dLat = (lat2 - lat1) * 111320;
      const dLon = (lon2 - lon1) * 111320 * Math.cos(lat1 * Math.PI / 180);
      return Math.sqrt(dLat * dLat + dLon * dLon);
    };

    // Get last stored points for duplicate detection
    let lastGpsPoint = null;
    let lastGsmPoint = null;
    
    const deviceId = points[0]?.device_id;
    if (deviceId) {
      const [gpsLast, gsmLast] = await Promise.all([
        supabase.from('gps_logs').select('latitude, longitude, speed, created_at').eq('device_id', deviceId).order('created_at', { ascending: false }).limit(1),
        supabase.from('gsm_logs').select('latitude, longitude, created_at').eq('device_id', deviceId).order('created_at', { ascending: false }).limit(1)
      ]);
      if (gpsLast.data && gpsLast.data.length > 0) lastGpsPoint = gpsLast.data[0];
      if (gsmLast.data && gsmLast.data.length > 0) lastGsmPoint = gsmLast.data[0];
    }

    for (const p of points) {
      // Use device timestamp if available, otherwise server time
      const createdAt = p.timestamp ? p.timestamp : new Date().toISOString();
      
      // ✅ CRITICAL DEBUG: Log raw source before processing
      console.log(`[TELEMETRY] Raw data: source='${p.source}', lat=${p.latitude}, lon=${p.longitude}, speed=${p.speed_kmh}`);
      
      // Fix: Swap Lat/Lon if swapped (India region check)
      let finalLat = parseFloat(p.latitude);
      let finalLon = parseFloat(p.longitude);
      
      // Basic Validation: Ignore 0,0 or invalid range
      if (!finalLat || !finalLon) continue;
      if (finalLat === 0 && finalLon === 0) continue;
      if (Math.abs(finalLat) > 90 || Math.abs(finalLon) > 180) continue;

      if (Math.abs(finalLat) > 60 && Math.abs(finalLon) < 60) {
         const temp = finalLat;
         finalLat = finalLon;
         finalLon = temp;
      }

      const source = (p.source || 'gps').toLowerCase();
      const speed = p.speed_kmh || 0;

      // ✅ DEBUG: Show which table this point will go to
      console.log(`[ROUTING] Source='${source}' -> Table='${source === 'gps' ? 'gps_logs' : 'gsm_logs'}'`);

      // ✅ IMPROVED DUPLICATE FILTER (Matches ESP32 Fix)
      // Don't reject legitimate movement - only filter true duplicates
      if (source === 'gps' && lastGpsPoint) {
        const dist = getDistanceMeters(lastGpsPoint.latitude, lastGpsPoint.longitude, finalLat, finalLon);
        const timeDiffSeconds = (new Date(createdAt) - new Date(lastGpsPoint.created_at)) / 1000;
        
        // Only filter if BOTH:
        // 1. Very close distance (< 8m instead of 5m)
        // 2. Very recent (< 3 seconds) AND stationary (speed < 1.5 km/h)
        // This prevents filtering legitimate slow movement
        if (dist < 8 && timeDiffSeconds < 3 && speed < 1.5) {
          console.log(`[FILTER] Skipping GPS duplicate (${dist.toFixed(1)}m, ${timeDiffSeconds.toFixed(1)}s, ${speed.toFixed(1)}km/h)`);
          continue;
        }
      }
      
      if (source === 'gsm' && lastGsmPoint) {
        const dist = getDistanceMeters(lastGsmPoint.latitude, lastGsmPoint.longitude, finalLat, finalLon);
        const timeDiffSeconds = (new Date(createdAt) - new Date(lastGsmPoint.created_at)) / 1000;
        
        // GSM is less accurate, use wider threshold (30m instead of 50m)
        // But still allow updates if enough time has passed
        if (dist < 30 && timeDiffSeconds < 10) {
          console.log(`[FILTER] Skipping GSM duplicate (${dist.toFixed(1)}m, ${timeDiffSeconds.toFixed(1)}s)`);
          continue;
        }
      }

      if (source === 'gps') {
          const row = {
              device_id: p.device_id,
              latitude: finalLat,
              longitude: finalLon,
              speed: speed,
              battery: p.battery_voltage || 4.0,
              signal: p.signal || 0,
              hdop: p.hdop || null,
              satellites: p.satellites || 0,
              created_at: createdAt
          };
          gpsRows.push(row);
          lastGpsPoint = { latitude: finalLat, longitude: finalLon, speed: speed, created_at: createdAt };
      } else {
          const row = {
              device_id: p.device_id,
              latitude: finalLat,
              longitude: finalLon,
              accuracy: p.hdop || 500,
              battery: p.battery_voltage || 4.0,
              signal: p.signal || 0,
              created_at: createdAt
          };
          gsmRows.push(row);
          lastGsmPoint = { latitude: finalLat, longitude: finalLon, created_at: createdAt };
      }
    }

    // Bulk Insert (only if there are rows to insert)
    const promises = [];
    if (gpsRows.length > 0) promises.push(supabase.from('gps_logs').insert(gpsRows));
    if (gsmRows.length > 0) promises.push(supabase.from('gsm_logs').insert(gsmRows));

    if (promises.length === 0) {
      // All points were filtered as duplicates
      return res.json({ status: 'ok', filtered: true });
    }

    const results = await Promise.all(promises);
    const errors = results.filter(r => r.error).map(r => r.error);

    if (errors.length > 0) {
      console.error('Supabase Error:', errors);
      return res.status(500).send('ERR: DB');
    }

    // --- ALERT LOGIC ---
    const latest = points[points.length - 1];
    const devId = latest.device_id;
    const latestSpeed = latest.speed_kmh;
    
    if (!deviceState[devId]) deviceState[devId] = { isMoving: false };
    
    // Check for Movement Start
    if (latestSpeed > 5.0 && !deviceState[devId].isMoving) {
        deviceState[devId].isMoving = true;
    }
    // Check for Stop
    else if (latestSpeed < 1.0 && deviceState[devId].isMoving) {
        deviceState[devId].isMoving = false;
    }

    addLog('DATA', `Received ${points.length} pts from ${points[0].device_id}. GPS: ${gpsRows.length}, GSM: ${gsmRows.length}`);
    
    // Check for pending commands
    const responseObj = { status: 'ok' };
    if (deviceCommands[devId]) {
        responseObj.command = deviceCommands[devId];
        console.log(`[CMD] Sending '${deviceCommands[devId]}' to ${devId}`);
        delete deviceCommands[devId]; // Clear after sending
    }

    res.json(responseObj);

  } catch (err) {
    console.error('Server Error:', err);
    res.status(500).send('ERR: Server');
  }
});

// --- 2. History Endpoint (For App) ---
// GET /api/history
app.get('/api/history', async (req, res) => {
  const { device_id, date } = req.query;
  if (!device_id) return res.status(400).json({ error: 'Missing device_id' });

  const { start, end } = getISTDateRange(date);

  // Query GPS Logs
  const { data: gpsData, error: gpsError } = await supabase
    .from('gps_logs')
    .select('latitude, longitude, speed, created_at, hdop, satellites')
    .eq('device_id', device_id)
    .gte('created_at', start)
    .lte('created_at', end)
    .order('created_at', { ascending: true });

  if (gpsError) return res.status(500).json({ error: gpsError.message });

  // Query GSM Logs
  const { data: gsmData, error: gsmError } = await supabase
    .from('gsm_logs')
    .select('latitude, longitude, created_at, accuracy')
    .eq('device_id', device_id)
    .gte('created_at', start)
    .lte('created_at', end)
    .order('created_at', { ascending: true });

  if (gsmError) return res.status(500).json({ error: gsmError.message });

  // Return GPS and GSM as separate arrays
  res.json({
    gps: (gpsData || []).map(p => ({ ...p, source: 'gps' })),
    gsm: (gsmData || []).map(p => ({ ...p, source: 'gsm' }))
  });
});

// --- 3. Stats Endpoint (For App) ---
// GET /api/stats
app.get('/api/stats', async (req, res) => {
  const { device_id } = req.query;
  if (!device_id) return res.status(400).json({ error: 'Missing device_id' });

  // 1. Get Latest Status (Independent of Date)
  const { error: latestErr, chosen: lastPointData } = await getBestLatestPoint(device_id, { gpsPreferredWindowMin: 3 });
  if (latestErr) return res.status(500).json({ error: latestErr.message });

  // 2. Get Today's Stats (IST)
  const { start } = getISTDateRange();

  // Fetch GPS Logs
  const { data: gpsData, error: gpsError } = await supabase
    .from('gps_logs')
    .select('latitude, longitude, speed, created_at')
    .eq('device_id', device_id)
    .gte('created_at', start)
    .order('created_at', { ascending: true });

  if (gpsError) return res.status(500).json({ error: gpsError.message });

  // Fetch GSM Logs (Fallback for stats if GPS is missing)
  const { data: gsmData, error: gsmError } = await supabase
    .from('gsm_logs')
    .select('latitude, longitude, created_at')
    .eq('device_id', device_id)
    .gte('created_at', start)
    .order('created_at', { ascending: true });

  if (gsmError) return res.status(500).json({ error: gsmError.message });

  // Combine for stats calculation if GPS is sparse
  let validPoints = gpsData || [];
  if (validPoints.length < 2 && gsmData && gsmData.length > 1) {
      // If we have almost no GPS data but lots of GSM data, use GSM for stats
      validPoints = gsmData.map(p => ({...p, speed: 0})); // GSM has no speed
  }

  let maxSpeed = 0;
  let totalDistanceKm = 0;
  let totalDurationMinutes = 0;
  
  if (validPoints.length > 1) {
    for (let i = 0; i < validPoints.length - 1; i++) {
      const p1 = validPoints[i];
      const p2 = validPoints[i + 1];
      
      if (p1.speed > maxSpeed) maxSpeed = p1.speed;

      const dist = getDistanceFromLatLonInKm(p1.latitude, p1.longitude, p2.latitude, p2.longitude);
      
      // ✅ IMPROVED STATS FILTER (Matches ESP32 Fix)
      // Count movement if:
      // 1. Distance > 15m (increased from 10m to match hardware threshold)
      // 2. OR speed > 2 km/h (actual movement detected)
      // This prevents counting GPS jitter but captures all real movement
      if (dist < 100 && (dist > 0.015 || p1.speed > 2)) {
         totalDistanceKm += dist; 
      }

      const diffMins = (new Date(p2.created_at) - new Date(p1.created_at)) / 1000 / 60;
      if (diffMins < 10 && diffMins > 0) totalDurationMinutes += diffMins;
    }
    if (validPoints[validPoints.length-1].speed > maxSpeed) maxSpeed = validPoints[validPoints.length-1].speed;
  }

  // Determine Status
  let status = 'Offline';
  if (lastPointData) {
      // Use timestamps to avoid timezone issues
      const now = new Date().getTime();
      const lastSeen = new Date(lastPointData.created_at).getTime();
      const diffMinutes = (now - lastSeen) / 1000 / 60;
      
      // Increased threshold to 10 mins to account for network delays
      status = diffMinutes < 10 ? 'Online' : `Last seen ${Math.round(diffMinutes)}m ago`;
  }
  
  // DEBUG LOG
  console.log(`[STATS] Device: ${device_id} | Source: ${lastPointData ? lastPointData.source : 'none'} | Status: ${status}`);

  res.json({
    date: new Date().toISOString().split('T')[0],
    max_speed: Math.round(maxSpeed),
    total_distance_km: parseFloat(totalDistanceKm.toFixed(2)),
    total_duration_minutes: Math.round(totalDurationMinutes),
    total_points: validPoints.length,
    status: status,
    source: lastPointData ? lastPointData.source : 'unknown',
    signal: lastPointData ? lastPointData.signal : 0,
    hdop: lastPointData ? lastPointData.hdop : null,
    satellites: lastPointData ? lastPointData.satellites : 0,
    last_lat: lastPointData ? lastPointData.latitude : null,
    last_lon: lastPointData ? lastPointData.longitude : null,
    last_speed: lastPointData ? lastPointData.speed : 0,
    last_seen: lastPointData ? lastPointData.created_at : null
  });
});

// --- 3b. Latest Best-Point Endpoint (For App Live Map) ---
// GET /api/latest?device_id=...
app.get('/api/latest', async (req, res) => {
  const { device_id } = req.query;
  if (!device_id) return res.status(400).json({ error: 'Missing device_id' });

  const { error: latestErr, chosen, decision } = await getBestLatestPoint(device_id, { gpsPreferredWindowMin: 3 });
  if (latestErr) return res.status(500).json({ error: latestErr.message });
  
  // FIX: Return default object instead of 404 when no data exists
  if (!chosen) {
    return res.json({
      device_id,
      latitude: 0,
      longitude: 0,
      speed: 0,
      source: 'none',
      hdop: 0,
      satellites: 0,
      signal: 0,
      created_at: new Date().toISOString(),
      decision: 'no_data'
    });
  }

  res.json({
    device_id,
    latitude: chosen.latitude,
    longitude: chosen.longitude,
    speed: chosen.speed,
    source: chosen.source,
    hdop: chosen.hdop,
    satellites: chosen.satellites,
    signal: chosen.signal,
    created_at: chosen.created_at,
    decision
  });
});

// --- 4. Diagnosis Endpoint ---
app.get('/api/diagnose', async (req, res) => {
  const { device_id } = req.query;
  if (!device_id) return res.status(400).json({ error: 'Missing device_id' });

  const { chosen: data } = await getBestLatestPoint(device_id, { gpsPreferredWindowMin: 3 });

  if (!data) return res.json({ status: 'Unknown', message: 'No data found from device.' });

  const diffMinutes = (new Date() - new Date(data.created_at)) / 1000 / 60;

  if (diffMinutes > 10) {
     return res.json({ status: 'Offline', message: `Last seen ${Math.round(diffMinutes)} mins ago.`, color: 'red' });
  }
  if (data.source === 'gsm') {
     return res.json({ status: 'Weak Signal', message: 'Using GSM backup. GPS signal weak.', color: 'orange' });
  }

  return res.json({ status: 'Healthy', message: 'System running perfectly.', color: 'green' });
});

// --- 5. Server Logs Endpoint (For Developer Tab) ---
app.get('/api/logs', (req, res) => {
  res.json({
    logs: serverLogs,
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    nodeVersion: process.version
  });
});

// --- 4. Admin: Clear All Data ---
app.post('/api/admin/clear-data', async (req, res) => {
  const { pin } = req.body;
  if (pin !== '1477') return res.status(403).json({ error: 'Invalid PIN' });

  try {
    // Delete all rows from tracking tables
    await supabase.from('gps_logs').delete().neq('id', 0);
    await supabase.from('gsm_logs').delete().neq('id', 0);
    await supabase.from('sms_inbox').delete().neq('id', 0);

    addLog('ADMIN', 'All database data cleared by admin');
    res.json({ status: 'ok', message: 'All data cleared' });
  } catch (err) {
    console.error('Clear Data Error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/reset-device', (req, res) => {
    const { device_id, pin } = req.body;
    if (pin !== '1477') return res.status(403).json({ error: 'Invalid PIN' });
    if (!device_id) return res.status(400).json({ error: 'Missing device_id' });
    
    deviceCommands[device_id] = 'reset';
    addLog('ADMIN', `Reset command queued for ${device_id}`);
    res.json({ success: true });
});

app.post('/api/admin/reconnect-device', (req, res) => {
    const { device_id, pin } = req.body;
    if (pin !== '1477') return res.status(403).json({ error: 'Invalid PIN' });
    if (!device_id) return res.status(400).json({ error: 'Missing device_id' });
    
    deviceCommands[device_id] = 'reconnect';
    addLog('ADMIN', `Reconnect command queued for ${device_id}`);
    res.json({ success: true });
});

// --- 6. SMS Management ---

// POST /api/sms/incoming (From Device)
app.post('/api/sms/incoming', async (req, res) => {
    const { device_id, raw_response } = req.body;
    
    if (!raw_response) return res.status(400).json({ error: 'No data' });

    addLog('SMS', `Raw SMS data received from ${device_id}`);

    // Simple Parser for AT+CMGL response
    const lines = raw_response.split('\n');
    let currentMsg = null;

    for (let line of lines) {
        line = line.trim();
        if (line.startsWith('+CMGL:')) {
            // Save previous if exists
            if (currentMsg) {
                const { error } = await supabase.from('sms_inbox').insert(currentMsg);
                if (error) console.error('SMS Insert Error:', error);
            }
            
            // Start new message
            const parts = line.split(',');
            let sender = parts[2] ? parts[2].replace(/"/g, '') : 'Unknown';
            
            currentMsg = {
                device_id: device_id || 'unknown',
                sender: sender,
                message: '',
                received_at: new Date().toISOString()
            };
        } else if (currentMsg && line.length > 0 && line !== 'OK') {
            currentMsg.message += line + ' ';
        }
    }
    
    // Save last message
    if (currentMsg) {
        const { error } = await supabase.from('sms_inbox').insert(currentMsg);
        if (error) console.error('SMS Insert Error (Last):', error);
    }

    res.json({ success: true });
});

// GET /api/admin/sms (For App)
app.get('/api/admin/sms', async (req, res) => {
    const { data, error } = await supabase
        .from('sms_inbox')
        .select('*')
        .order('received_at', { ascending: false })
        .limit(50);
        
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
});

// DELETE /api/admin/sms/:id (For App)
app.delete('/api/admin/sms/:id', async (req, res) => {
    const { id } = req.params;
    const { error } = await supabase.from('sms_inbox').delete().eq('id', id);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
});

// --- Helpers ---

function getISTDateRange(dateStr) {
  let targetDate = dateStr ? new Date(dateStr) : new Date(new Date().getTime() + (5.5 * 60 * 60 * 1000));
  const dateString = targetDate.toISOString().split('T')[0];
  
  return {
    start: `${dateString}T00:00:00+05:30`,
    end: `${dateString}T23:59:59+05:30`,
    dateLabel: dateString
  };
}

function getDistanceFromLatLonInKm(lat1, lon1, lat2, lon2) {
  const R = 6371; 
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * Math.sin(dLon/2) * Math.sin(dLon/2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function deg2rad(deg) { return deg * (Math.PI/180); }

app.listen(PORT, () => {
  console.log(`Papaji GPS Backend running on port ${PORT}`);
  console.log(`Deployment triggered at ${new Date().toISOString()}`);
});