/*
 * SMS Routes
 */

const express = require('express');
const router = express.Router();
const SMSModel = require('../models/sms.model');
const { log } = require('../utils/logger');

// POST /api/sms/incoming
router.post('/incoming', async (req, res) => {
  const { device_id, raw_response } = req.body;
  if (!raw_response) return res.status(400).json({ error: 'No data' });

  log('SMS', `SMS received from ${device_id}`);

  // Parse SMS
  const lines = raw_response.split('\n');
  let currentMsg = null;

  for (let line of lines) {
    line = line.trim();
    if (line.startsWith('+CMGL:')) {
      if (currentMsg) {
        await SMSModel.insert(currentMsg);
      }
      
      const parts = line.split(',');
      const sender = parts[2] ? parts[2].replace(/"/g, '') : 'Unknown';
      
      currentMsg = {
        device_id: device_id || 'unknown',
        sender,
        message: '',
        received_at: new Date().toISOString()
      };
    } else if (currentMsg && line.length > 0 && line !== 'OK') {
      currentMsg.message += line + ' ';
    }
  }
  
  if (currentMsg) {
    await SMSModel.insert(currentMsg);
  }

  res.json({ success: true });
});

// GET /api/sms/list
router.get('/list', async (req, res) => {
  const { data, error } = await SMSModel.getRecent(50);
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// DELETE /api/sms/:id
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  const { error } = await SMSModel.delete(id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

module.exports = router;
