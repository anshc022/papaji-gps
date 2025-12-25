/*
 * Admin Routes
 */

const express = require('express');
const router = express.Router();
const GPSModel = require('../models/gps.model');
const SMSModel = require('../models/sms.model');
const { log, getLogs } = require('../utils/logger');
const supabase = require('../supabase');

// Admin PIN
const ADMIN_PIN = '1477';

// Middleware to check PIN
function requirePin(req, res, next) {
  const { pin } = req.body;
  if (pin !== ADMIN_PIN) {
    return res.status(403).json({ error: 'Invalid PIN' });
  }
  next();
}

// POST /api/admin/clear-data
router.post('/clear-data', requirePin, async (req, res) => {
  try {
    await GPSModel.deleteAll();
    await supabase.from('gsm_logs').delete().neq('id', 0);
    await SMSModel.deleteAll();

    log('ADMIN', 'All database data cleared');
    res.json({ status: 'ok', message: 'All data cleared' });
  } catch (err) {
    console.error('[CLEAR ERROR]', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/reset-device
router.post('/reset-device', requirePin, (req, res) => {
  const { device_id } = req.body;
  if (!device_id) return res.status(400).json({ error: 'Missing device_id' });
  
  // Access deviceCommands from telemetry module
  const { deviceCommands } = require('./telemetry.routes');
  deviceCommands[device_id] = 'reset';
  
  log('ADMIN', `Reset queued for ${device_id}`);
  res.json({ success: true });
});

// POST /api/admin/reconnect-device
router.post('/reconnect-device', requirePin, (req, res) => {
  const { device_id } = req.body;
  if (!device_id) return res.status(400).json({ error: 'Missing device_id' });
  
  // Access deviceCommands from telemetry module
  const { deviceCommands } = require('./telemetry.routes');
  deviceCommands[device_id] = 'reconnect';
  
  log('ADMIN', `Reconnect queued for ${device_id}`);
  res.json({ success: true });
});

// GET /api/logs
router.get('/logs', (req, res) => {
  res.json({
    logs: getLogs(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    nodeVersion: process.version
  });
});

module.exports = router;
