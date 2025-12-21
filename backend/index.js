const express = require('express');
const cors = require('cors');
const supabase = require('./supabase');
const mqtt = require('mqtt');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// --- MQTT SETUP ---
const MQTT_BROKER = 'mqtt://broker.hivemq.com:1883';
const MQTT_TOPIC = 'papaji/gps/telemetry';

const mqttClient = mqtt.connect(MQTT_BROKER);

mqttClient.on('connect', () => {
  console.log('[MQTT] Connected to HiveMQ broker');
  mqttClient.subscribe(MQTT_TOPIC, (err) => {
    if (!err) {
      console.log(`[MQTT] Subscribed to topic: ${MQTT_TOPIC}`);
    } else {
      console.error('[MQTT] Subscribe error:', err);
    }
  });
});

mqttClient.on('message', async (topic, message) => {
  try {
    const data = JSON.parse(message.toString());
    console.log(`[MQTT] Received:`, data);

    // Save to Supabase
    const dbRow = {
      device_id: data.device_id,
      latitude: data.latitude,
      longitude: data.longitude,
      speed: data.speed_kmh,
      battery: data.battery || 4.0,
      source: data.source || 'gps',
      created_at: new Date().toISOString()
    };

    const { error } = await supabase
      .from('tracking_history')
      .insert([dbRow]);

    if (error) {
      console.error('[MQTT] Supabase Error:', error);
    } else {
      console.log(`[MQTT] ✓ Saved to database: ${data.latitude}, ${data.longitude}`);
    }
  } catch (err) {
    console.error('[MQTT] Parse error:', err.message);
  }
});

mqttClient.on('error', (err) => {
  console.error('[MQTT] Connection error:', err);
});

// In-memory command queue for Remote Config
const pendingCommands = {}; 
// In-memory Route Cache (Device ID -> Array of Points)
const deviceRoutes = {}; 
// In-memory Learning State (Device ID -> { startTime, active })
const learningState = {};

// Load Routes from DB on Startup
async function loadRoutesFromDB() {
    const { data, error } = await supabase
        .from('device_routes')
        .select('*');
    
    if (data) {
        data.forEach(row => {
            deviceRoutes[row.device_id] = {
                points: row.route_data,
                max_speed: row.max_speed
            };
        });
        console.log(`[INIT] Loaded ${data.length} routes from database.`);
    }
}
loadRoutesFromDB();

// Middleware
app.use(cors());
app.use(express.json()); // Parse JSON bodies (important for ESP32)

// --- 1. Telemetry Endpoint (For ESP32) ---
// POST /api/telemetry
app.post('/api/telemetry', async (req, res) => {
  try {
    const body = req.body;
    let points = [];

    // Handle Batch (Array) or Single Object
    if (Array.isArray(body)) {
      points = body;
    } else {
      points = [body];
    }

    if (points.length === 0) return res.status(400).send('ERR: No Data');

    // Map to Supabase Schema
    const dbRows = points.map(p => ({
      device_id: p.device_id,
      latitude: p.latitude,
      longitude: p.longitude,
      speed: p.speed_kmh,
      battery: p.battery_voltage,
      source: p.source || 'gps',
      created_at: p.timestamp ? new Date(p.timestamp * 1000).toISOString() : new Date().toISOString() // Use device time if available
    }));

    // Bulk Insert into Supabase
    const { error } = await supabase
      .from('tracking_history')
      .insert(dbRows);
      
    // Log the first point's signal for debugging
    if (points[0].signal) {
        console.log(`[Batch] Received ${points.length} points. Signal: ${points[0].signal}/31`);
    }

    if (error) {
      console.error('Supabase Error:', error);
      return res.status(500).send('ERR: DB');
    }

    // Fix: Extract device_id from the first point
    const device_id = points[0].device_id;
    const source = points[0].source;

    console.log(`[${new Date().toISOString()}] Data received from ${device_id} (Source: ${source || 'gps'}) - AWS Live v2`);
    
    // --- FEATURE 3: AUTO-LEARNING ROUTE DEVIATION ---
    // Check if we are in learning mode
    const lState = learningState[device_id];
    
    if (lState && lState.active) {
        // Check if learning period (48 hours) is over
        const now = new Date();
        const diffHours = (now - new Date(lState.startTime)) / 1000 / 60 / 60;
        
        if (diffHours >= 48) {
            // Time to lock the pattern!
            await finishLearning(device_id);
            console.log(`[LEARNING] 48h Complete. Pattern Locked for ${device_id}.`);
        } else {
            console.log(`[LEARNING] Recording pattern... (${Math.round(48 - diffHours)}h remaining)`);
        }
    } 
    // If not learning, and we have a route, check deviation
    else if (deviceRoutes[device_id]) {
       const lastPoint = points[points.length - 1];
       const isOffRoute = checkRouteDeviation(lastPoint, deviceRoutes[device_id]);
       if (isOffRoute) {
           console.log(`[ALERT] 🚨 TRACTOR OFF ROUTE! Deviation detected for ${device_id}.`);
           // Trigger SMS/Notification here
       }
    }

    // Check for pending commands (Remote Config)
    let responsePayload = { status: 'ok' };
    if (pendingCommands[device_id]) {
      responsePayload = { ...responsePayload, ...pendingCommands[device_id] };
      delete pendingCommands[device_id]; // Clear after sending
      console.log(`[CMD] Sending to ${device_id}:`, responsePayload);
    }
    
    res.json(responsePayload);

  } catch (err) {
    console.error('Server Error:', err);
    res.status(500).send('ERR: Server');
  }
});

// --- 2. History Endpoint (For App) ---
// GET /api/history?device_id=papaji_tractor_01&date=2025-12-19
app.get('/api/history', async (req, res) => {
  const { device_id, date } = req.query;

  if (!device_id) return res.status(400).json({ error: 'Missing device_id' });

  // Default to today if no date provided
  const queryDate = date || new Date().toISOString().split('T')[0];
  
  const startDate = `${queryDate}T00:00:00`;
  const endDate = `${queryDate}T23:59:59`;

  const { data, error } = await supabase
    .from('tracking_history')
    .select('latitude, longitude, speed, created_at')
    .eq('device_id', device_id)
    .gte('created_at', startDate)
    .lte('created_at', endDate)
    .order('created_at', { ascending: true });

  if (error) return res.status(500).json({ error: error.message });

  res.json(data);
});

// Helper: Haversine Distance Calculation
function getDistanceFromLatLonInKm(lat1, lon1, lat2, lon2) {
  const R = 6371; // Radius of the earth in km
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function deg2rad(deg) {
  return deg * (Math.PI / 180);
}

// --- 3. Stats Endpoint (For App) ---
// GET /api/stats?device_id=papaji_tractor_01
app.get('/api/stats', async (req, res) => {
  const { device_id } = req.query;
  
  if (!device_id) return res.status(400).json({ error: 'Missing device_id' });

  // Get today's stats
  const today = new Date().toISOString().split('T')[0];
  const startDate = `${today}T00:00:00`;

  const { data, error } = await supabase
    .from('tracking_history')
    .select('latitude, longitude, speed, created_at')
    .eq('device_id', device_id)
    .gte('created_at', startDate)
    .order('created_at', { ascending: true });

  if (error) return res.status(500).json({ error: error.message });

  // Calculate Stats
  let maxSpeed = 0;
  let totalDistanceKm = 0;

  if (data && data.length > 1) {
    for (let i = 0; i < data.length - 1; i++) {
      const p1 = data[i];
      const p2 = data[i + 1];
      
      // Update Max Speed
      if (p1.speed > maxSpeed) maxSpeed = p1.speed;

      // Calculate Distance between p1 and p2
      const dist = getDistanceFromLatLonInKm(p1.latitude, p1.longitude, p2.latitude, p2.longitude);
      
      // Filter out GPS drift (e.g., ignore jumps > 100km in 5 seconds)
      if (dist < 100) { 
        totalDistanceKm += dist;
      }
    }
    // Check last point speed
    if (data[data.length-1].speed > maxSpeed) maxSpeed = data[data.length-1].speed;
  }

  res.json({
    date: today,
    max_speed: Math.round(maxSpeed * 10) / 10, // Round to 1 decimal
    total_distance_km: Math.round(totalDistanceKm * 100) / 100, // Round to 2 decimals
    total_points: data.length,
    status: data.length > 0 ? 'Active' : 'Inactive'
  });
});

// --- 4. OTA Updates Endpoints (REMOVED) ---

// --- 5. Diagnosis & Auto-Repair Endpoint ---
// POST /api/diagnose
app.post('/api/diagnose', async (req, res) => {
  const { device_id } = req.body;
  
  if (!device_id) return res.status(400).json({ error: 'Missing device_id' });

  // Get last status
  const { data, error } = await supabase
    .from('tracking_history')
    .select('*')
    .eq('device_id', device_id)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (error || !data) return res.json({ status: 'Unknown', message: 'No data found' });

  const lastSeen = new Date(data.created_at);
  const now = new Date();
  const diffMinutes = (now - lastSeen) / 1000 / 60;

  // 1. Check Connectivity
  if (diffMinutes > 10) {
     return res.json({ 
       status: 'Offline', 
       message: `Last seen ${Math.round(diffMinutes)} mins ago. Check Power/SIM.`,
       color: 'red'
     });
  }

  // 2. Check GPS Health
  if (data.source === 'gsm') {
     // GPS is failing, try restart
     pendingCommands[device_id] = { restart: true };
     return res.json({ 
       status: 'Repairing', 
       message: 'GPS Signal Weak. Auto-Restart command sent.',
       color: 'orange'
     });
  }

  // 3. Check Battery (Example threshold)
  if (data.battery < 3.5) {
    return res.json({ 
      status: 'Low Battery', 
      message: `Battery is critical (${data.battery}V). Charge immediately.`,
      color: 'red'
    });
  }

  return res.json({ 
    status: 'Healthy', 
    message: 'System is running perfectly.',
    color: 'green'
  });
});

// --- 6. Route Management (Feature #3) ---

// Endpoint: Start Learning Mode (Manual Trigger)
app.post('/api/learn/start', (req, res) => {
    const { device_id } = req.body;
    if (!device_id) return res.status(400).json({ error: 'Missing device_id' });

    learningState[device_id] = { startTime: new Date(), active: true };
    delete deviceRoutes[device_id]; // Clear old route
    
    console.log(`[LEARNING] Started for ${device_id}`);
    res.json({ status: 'started', message: 'Learning mode activated for 48h' });
});

// Helper: Finish Learning & Lock Route
async function finishLearning(device_id) {
    if (!learningState[device_id]) return;

    const startTime = learningState[device_id].startTime.toISOString();
    
    // Fetch all points recorded during the learning phase
    const { data: routePoints } = await supabase
        .from('tracking_history')
        .select('latitude, longitude, speed')
        .eq('device_id', device_id)
        .gte('created_at', startTime)
        .order('created_at', { ascending: true }); 
    
    if (routePoints && routePoints.length > 0) {
        // Calculate Max Speed seen during learning
        let maxSpeed = 0;
        if (routePoints) {
            maxSpeed = Math.max(...routePoints.map(d => d.speed || 0));
        }

        // Save to memory
        deviceRoutes[device_id] = {
            points: routePoints,
            maxSpeed: maxSpeed * 1.2 // Add 20% buffer
        };

        // Save to Database (Persistence)
        const { error } = await supabase
            .from('device_routes')
            .upsert({ 
                device_id: device_id, 
                route_data: routePoints, 
                max_speed: deviceRoutes[device_id].maxSpeed,
                updated_at: new Date()
            });

        if (error) console.error('DB Save Error:', error);
        else console.log(`[LEARNING] Route saved to DB with ${routePoints.length} points.`);
    }
    
    learningState[device_id].active = false;
}

// POST /api/learn/delete (Clear Data)
app.post('/api/learn/delete', async (req, res) => {
    const { device_id } = req.body;
    
    // Clear Memory
    if (deviceRoutes[device_id]) delete deviceRoutes[device_id];
    if (learningState[device_id]) delete learningState[device_id];

    // Clear Database
    const { error } = await supabase
        .from('device_routes')
        .delete()
        .eq('device_id', device_id);

    if (error) {
        console.error('DB Delete Error:', error);
        return res.status(500).json({ error: 'Failed to delete from DB' });
    }

    console.log(`[LEARNING] Data deleted for ${device_id}`);
    res.json({ status: 'deleted', message: 'Learning data cleared.' });
});

// POST /api/set-route (Manual Override)
app.post('/api/set-route', async (req, res) => {
    const { device_id, route } = req.body; 
    if (device_id && route && Array.isArray(route)) {
        const maxSpeed = 40; // Default
        
        // Update Memory
        deviceRoutes[device_id] = { points: route, maxSpeed: maxSpeed }; 
        
        // Update DB
        await supabase.from('device_routes').upsert({
            device_id: device_id,
            route_data: route,
            max_speed: maxSpeed,
            updated_at: new Date()
        });

        console.log(`[ROUTE] Manual route set for ${device_id}`);
        res.json({ status: 'ok', message: 'Route saved' });
    } else {
        res.status(400).json({ error: 'Invalid data' });
    }
});

// Helper: Check Deviation
function checkRouteDeviation(point, routeData) {
    const THRESHOLD_KM = 0.5; // 500 meters allowed deviation
    const route = routeData.points;
    const speedLimit = routeData.maxSpeed;

    // 1. Speed Check
    if (point.speed_kmh > speedLimit) {
        console.log(`[ALERT] Speed Violation! ${point.speed_kmh} > ${speedLimit}`);
        return true;
    }
    
    // 2. Location Check: Are we within 500m of ANY point on the route?
    for (let p of route) {
        const rLat = p.lat || p.latitude;
        const rLon = p.lon || p.longitude;
        
        const dist = getDistanceFromLatLonInKm(point.latitude, point.longitude, rLat, rLon);
        if (dist < THRESHOLD_KM) {
            return false; // Safe (we are near the path)
        }
    }
    return true; // Far from ALL points -> Deviation!
}

app.listen(PORT, () => {
  console.log(`Papaji GPS Backend running on port ${PORT}`);
});
