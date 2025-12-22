const express = require('express');
const cors = require('cors');
const supabase = require('./supabase');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// In-memory state for alerts
const deviceState = {}; 

// Middleware
app.use(cors());
app.use(express.json());

// --- Helper: Send Push Notification ---
async function sendPushNotification(deviceId, title, body) {
  try {
    // 1. Get Token from DB
    const { data, error } = await supabase
      .from('device_tokens')
      .select('token')
      .eq('device_id', deviceId)
      .single();

    if (error || !data || !data.token) return;

    // 2. Send to Expo
    const message = {
      to: data.token,
      sound: 'default',
      title: title,
      body: body,
      data: { someData: 'goes here' },
    };

    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(message),
    });
    
    console.log(`[PUSH] Sent to ${deviceId}: ${title}`);
  } catch (e) {
    console.error('[PUSH] Error:', e);
  }
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

    // Map to Supabase Schema
    const dbRows = points.map(p => {
      const createdAt = new Date().toISOString();

      // Fix: Swap Lat/Lon if swapped (India region check)
      let finalLat = p.latitude;
      let finalLon = p.longitude;

      if (Math.abs(finalLat) > 60 && Math.abs(finalLon) < 60) {
         const temp = finalLat;
         finalLat = finalLon;
         finalLon = temp;
      }

      return {
        device_id: p.device_id,
        latitude: finalLat,
        longitude: finalLon,
        speed: p.speed_kmh,
        battery: p.battery_voltage || 4.0,
        source: p.source || 'gps',
        signal: p.signal || 0,
        created_at: createdAt
      };
    });

    // Bulk Insert into Supabase
    const { error } = await supabase.from('tracking_history').insert(dbRows);

    if (error) {
      console.error('Supabase Error:', error);
      return res.status(500).send('ERR: DB');
    }

    // --- ALERT LOGIC ---
    const latest = points[points.length - 1];
    const devId = latest.device_id;
    const speed = latest.speed_kmh;
    
    if (!deviceState[devId]) deviceState[devId] = { isMoving: false };
    
    // Check for Movement Start
    if (speed > 5.0 && !deviceState[devId].isMoving) {
        deviceState[devId].isMoving = true;
        // sendPushNotification(devId, 'Tractor Moving!', `Speed: ${speed} km/h`);
    }
    // Check for Stop
    else if (speed < 1.0 && deviceState[devId].isMoving) {
        deviceState[devId].isMoving = false;
        // Optional: Send "Stopped" alert
        // sendPushNotification(devId, 'Tractor Stopped', 'Engine is off.');
    }

    console.log(`[${new Date().toLocaleTimeString()}] Data received from ${points[0].device_id} (${points.length} pts). Source: ${latest.source || 'unknown'}`);
    
    res.json({ status: 'ok' });

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

  const { data, error } = await supabase
    .from('tracking_history')
    .select('latitude, longitude, speed, created_at')
    .eq('device_id', device_id)
    .gte('created_at', start)
    .lte('created_at', end)
    .neq('source', 'heartbeat')
    .order('created_at', { ascending: true });

  if (error) return res.status(500).json({ error: error.message });

  // Filter: Remove GPS Drift (Stationary Jitter)
  const filteredData = [];
  if (data && data.length > 0) {
      filteredData.push(data[0]); 

      for (let i = 1; i < data.length; i++) {
          const prev = filteredData[filteredData.length - 1];
          const curr = data[i];

          const distMeters = getDistanceFromLatLonInKm(prev.latitude, prev.longitude, curr.latitude, curr.longitude) * 1000;
          const timeDiff = (new Date(curr.created_at) - new Date(prev.created_at)) / 1000 / 60; // mins

          // Accept if moved > 10m OR speed > 3km/h OR time gap > 5 mins
          if (distMeters > 10 || curr.speed > 3.0 || timeDiff > 5) {
              filteredData.push(curr);
          }
      }
  }

  res.json(filteredData);
});

// --- 3. Stats Endpoint (For App) ---
// GET /api/stats
app.get('/api/stats', async (req, res) => {
  const { device_id } = req.query;
  if (!device_id) return res.status(400).json({ error: 'Missing device_id' });

  // 1. Get Latest Status (Independent of Date)
  const { data: lastPointData } = await supabase
    .from('tracking_history')
    .select('created_at, source, signal')
    .eq('device_id', device_id)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  // 2. Get Today's Stats (IST)
  const { start } = getISTDateRange();

  const { data, error } = await supabase
    .from('tracking_history')
    .select('latitude, longitude, speed, created_at, source')
    .eq('device_id', device_id)
    .gte('created_at', start)
    .order('created_at', { ascending: true });

  if (error) return res.status(500).json({ error: error.message });

  let maxSpeed = 0;
  let totalDistanceKm = 0;
  let totalDurationMinutes = 0;
  
  const validPoints = data ? data.filter(p => p.source !== 'heartbeat') : [];

  if (validPoints.length > 1) {
    for (let i = 0; i < validPoints.length - 1; i++) {
      const p1 = validPoints[i];
      const p2 = validPoints[i + 1];
      
      if (p1.speed > maxSpeed) maxSpeed = p1.speed;

      const dist = getDistanceFromLatLonInKm(p1.latitude, p1.longitude, p2.latitude, p2.longitude);
      if (dist < 100) totalDistanceKm += dist; // Ignore jumps > 100km

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

  res.json({
    date: new Date().toISOString().split('T')[0],
    max_speed: Math.round(maxSpeed * 10) / 10,
    total_distance_km: Math.round(totalDistanceKm * 100) / 100,
    total_duration_minutes: Math.round(totalDurationMinutes),
    total_points: data ? data.length : 0,
    status: status,
    source: lastPointData ? lastPointData.source : 'gps',
    signal: lastPointData ? lastPointData.signal : 0
  });
});

// --- 4. Diagnosis Endpoint ---
app.post('/api/diagnose', async (req, res) => {
  const { device_id } = req.body;
  if (!device_id) return res.status(400).json({ error: 'Missing device_id' });

  const { data } = await supabase
    .from('tracking_history')
    .select('*')
    .eq('device_id', device_id)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (!data) return res.json({ status: 'Unknown', message: 'No data found' });

  const diffMinutes = (new Date() - new Date(data.created_at)) / 1000 / 60;

  if (diffMinutes > 10) {
     return res.json({ status: 'Offline', message: `Last seen ${Math.round(diffMinutes)} mins ago.`, color: 'red' });
  }
  if (data.source === 'gsm') {
     return res.json({ status: 'Weak Signal', message: 'Using GSM backup. GPS signal weak.', color: 'orange' });
  }

  return res.json({ status: 'Healthy', message: 'System running perfectly.', color: 'green' });
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
});
