/*
 * GPS Data Routes (App → Server)
 */

const express = require('express');
const router = express.Router();
const GPSModel = require('../models/gps.model');
const { getDistanceKm } = require('../utils/distance');
const { getISTDateRange } = require('../utils/date');

// GET /api/history
router.get('/history', async (req, res) => {
  const { device_id, date } = req.query;
  if (!device_id) return res.status(400).json({ error: 'Missing device_id' });

  const { start, end } = getISTDateRange(date);
  const { data, error } = await GPSModel.getHistory(device_id, start, end);

  if (error) return res.status(500).json({ error: error.message });

  res.json({
    gps: data.map(p => ({ ...p, source: 'gps' })),
    gsm: [] // Empty for backward compatibility
  });
});

// GET /api/stats
router.get('/stats', async (req, res) => {
  const { device_id } = req.query;
  if (!device_id) return res.status(400).json({ error: 'Missing device_id' });

  // Get latest point
  const { data: lastPoint } = await GPSModel.getLatest(device_id);

  // Get today's data
  const { start } = getISTDateRange();
  const { data: points, error } = await GPSModel.getHistory(device_id, start, new Date().toISOString());

  if (error) return res.status(500).json({ error: error.message });

  // Calculate stats
  let maxSpeed = 0;
  let totalDistance = 0;
  let totalDuration = 0;

  if (points.length > 1) {
    for (let i = 0; i < points.length - 1; i++) {
      const p1 = points[i];
      const p2 = points[i + 1];
      
      if (p1.speed > maxSpeed) maxSpeed = p1.speed;

      const dist = getDistanceKm(p1.latitude, p1.longitude, p2.latitude, p2.longitude);
      if (dist < 100 && (dist > 0.015 || p1.speed > 2)) {
        totalDistance += dist;
      }

      const timeDiff = (new Date(p2.created_at) - new Date(p1.created_at)) / 60000;
      if (timeDiff > 0 && timeDiff < 10) totalDuration += timeDiff;
    }
    if (points[points.length - 1].speed > maxSpeed) {
      maxSpeed = points[points.length - 1].speed;
    }
  }

  // Determine status
  let status = 'Offline';
  if (lastPoint) {
    const diffMin = (Date.now() - new Date(lastPoint.created_at).getTime()) / 60000;
    status = diffMin < 10 ? 'Online' : `Last seen ${Math.round(diffMin)}m ago`;
  }

  res.json({
    date: new Date().toISOString().split('T')[0],
    max_speed: Math.round(maxSpeed),
    total_distance_km: parseFloat(totalDistance.toFixed(2)),
    total_duration_minutes: Math.round(totalDuration),
    total_points: points.length,
    status,
    source: lastPoint ? 'gps' : 'none',
    signal: lastPoint?.signal || 0,
    hdop: lastPoint?.hdop || null,
    satellites: lastPoint?.satellites || 0,
    last_lat: lastPoint?.latitude || null,
    last_lon: lastPoint?.longitude || null,
    last_speed: lastPoint?.speed || 0,
    last_seen: lastPoint?.created_at || null
  });
});

// GET /api/latest
router.get('/latest', async (req, res) => {
  const { device_id } = req.query;
  if (!device_id) return res.status(400).json({ error: 'Missing device_id' });

  const { data: point } = await GPSModel.getLatest(device_id);

  if (!point) {
    return res.json({
      device_id,
      latitude: 0,
      longitude: 0,
      speed: 0,
      source: 'none',
      hdop: 0,
      satellites: 0,
      signal: 0,
      created_at: new Date().toISOString()
    });
  }

  res.json({
    device_id,
    latitude: point.latitude,
    longitude: point.longitude,
    speed: point.speed,
    source: 'gps',
    hdop: point.hdop,
    satellites: point.satellites,
    signal: point.signal,
    created_at: point.created_at
  });
});

// GET /api/diagnose
router.get('/diagnose', async (req, res) => {
  const { device_id } = req.query;
  if (!device_id) return res.status(400).json({ error: 'Missing device_id' });

  const { data: point } = await GPSModel.getLatest(device_id);

  if (!point) {
    return res.json({
      status: 'Unknown',
      message: 'No data from device',
      color: 'gray'
    });
  }

  const diffMin = (Date.now() - new Date(point.created_at).getTime()) / 60000;

  if (diffMin > 10) {
    return res.json({
      status: 'Offline',
      message: `Last seen ${Math.round(diffMin)} mins ago`,
      color: 'red'
    });
  }

  return res.json({
    status: 'Healthy',
    message: 'GPS tracking active',
    color: 'green'
  });
});

module.exports = router;
