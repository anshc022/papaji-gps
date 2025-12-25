/*
 * Telemetry Routes (ESP32 → Server)
 */

const express = require('express');
const router = express.Router();
const GPSModel = require('../models/gps.model');
const { getDistanceMeters } = require('../utils/distance');
const { log } = require('../utils/logger');

// In-memory state
const deviceState = {};
const deviceCommands = {};

// POST /api/telemetry
router.post('/', async (req, res) => {
  try {
    const points = Array.isArray(req.body) ? req.body : [req.body];
    if (points.length === 0) return res.status(400).json({ error: 'No data' });

    const deviceId = points[0]?.device_id;
    if (!deviceId) return res.status(400).json({ error: 'Missing device_id' });

    // Get last GPS point for duplicate detection
    const { data: lastPoint } = await GPSModel.getLatest(deviceId);

    const gpsRows = [];

    for (const p of points) {
      // Validate coordinates
      let lat = parseFloat(p.latitude);
      let lon = parseFloat(p.longitude);
      
      if (!lat || !lon || (lat === 0 && lon === 0)) continue;
      if (Math.abs(lat) > 90 || Math.abs(lon) > 180) continue;

      // Auto-fix swapped coordinates (India region)
      if (Math.abs(lat) > 60 && Math.abs(lon) < 60) {
        [lat, lon] = [lon, lat];
      }

      const source = (p.source || 'gps').toLowerCase();
      const speed = p.speed_kmh || 0;
      
      // Fix: GSM often sends Local Time (IST) which looks like future UTC
      // For GSM, we trust the server receive time instead
      let createdAt = p.timestamp;
      if (!createdAt || source === 'gsm') {
        createdAt = new Date().toISOString();
      }

      // ALLOW BOTH GPS AND GSM
      // if (source !== 'gps') { ... } // Removed filter

      // Duplicate filter
      if (lastPoint) {
        const dist = getDistanceMeters(lastPoint.latitude, lastPoint.longitude, lat, lon);
        const timeDiff = (new Date(createdAt) - new Date(lastPoint.created_at)) / 1000;
        
        if (dist < 8 && timeDiff < 3 && speed < 1.5) {
          continue;
        }
      }

      gpsRows.push({
        device_id: deviceId,
        latitude: lat,
        longitude: lon,
        speed: speed,
        battery: p.battery_voltage || 4.0,
        signal: p.signal || 0,
        hdop: p.hdop || null,
        satellites: p.satellites || 0,
        source: source,
        created_at: createdAt
      });
    }

    if (gpsRows.length === 0) {
      return res.json({ status: 'ok', filtered: true });
    }

    const { error } = await GPSModel.insert(gpsRows);
    if (error) {
      console.error('[DB ERROR]', error);
      return res.status(500).json({ error: 'Database error' });
    }

    // Update device state
    const latest = points[points.length - 1];
    const latestSpeed = latest.speed_kmh || 0;
    
    if (!deviceState[deviceId]) deviceState[deviceId] = { isMoving: false };
    
    if (latestSpeed > 5.0 && !deviceState[deviceId].isMoving) {
      deviceState[deviceId].isMoving = true;
    } else if (latestSpeed < 1.0 && deviceState[deviceId].isMoving) {
      deviceState[deviceId].isMoving = false;
    }

    log('DATA', `Received ${points.length} points, stored ${gpsRows.length} GPS`);

    // Send pending commands
    const response = { status: 'ok' };
    if (deviceCommands[deviceId]) {
      response.command = deviceCommands[deviceId];
      delete deviceCommands[deviceId];
    }

    res.json(response);

  } catch (err) {
    console.error('[SERVER ERROR]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Export device state and commands for admin routes
module.exports = { router, deviceState, deviceCommands };
