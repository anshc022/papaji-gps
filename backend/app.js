/*
 * ============================================
 * PAPAJI GPS TRACKER - BACKEND API (GPS ONLY)
 * ============================================
 * Clean MVC Architecture
 */

const express = require('express');
const cors = require('cors');
const DeviceModel = require('./models/device.model');
const { getLogs } = require('./utils/logger');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================
// MIDDLEWARE
// ============================================
app.use(cors());
app.use(express.json());

// ============================================
// ROUTES
// ============================================
const { router: telemetryRouter } = require('./routes/telemetry.routes');
const gpsRouter = require('./routes/gps.routes');
const smsRouter = require('./routes/sms.routes');
const adminRouter = require('./routes/admin.routes');

// Mount routes
app.use('/api/telemetry', telemetryRouter);
app.use('/api', gpsRouter);
app.use('/api/sms', smsRouter);
app.use('/api/admin', adminRouter);

// Server Logs Endpoint
app.get('/api/logs', (req, res) => {
  res.json({
    logs: getLogs(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    nodeVersion: process.version
  });
});

// Device token registration
app.post('/api/register-token', async (req, res) => {
  const { device_id, token } = req.body;
  if (!device_id || !token) return res.status(400).json({ error: 'Missing data' });

  const { error } = await DeviceModel.registerToken(device_id, token);
  if (error) return res.status(500).json({ error: error.message });
  
  res.json({ status: 'ok' });
});

// Health check
app.get('/', (req, res) => {
  res.json({
    service: 'Papaji GPS Backend',
    status: 'running',
    mode: 'GPS-only',
    version: '2.0',
    uptime: process.uptime()
  });
});

// ============================================
// START SERVER
// ============================================
app.listen(PORT, () => {
  console.log('\n========================================');
  console.log('  PAPAJI GPS BACKEND - GPS ONLY MODE');
  console.log('========================================');
  console.log(`Server: http://localhost:${PORT}`);
  console.log(`Started: ${new Date().toISOString()}`);
  console.log('Architecture: MVC (Models/Routes)');
  console.log('========================================\n');
});
