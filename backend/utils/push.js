/*
 * Push Notification Utility
 * Sends notifications via Expo Push API (free, no EAS needed)
 */

const https = require('https');

/**
 * Send push notification to a device
 * @param {string} pushToken - Expo push token (ExponentPushToken[xxx])
 * @param {string} title - Notification title
 * @param {string} body - Notification body text
 * @param {object} data - Optional data payload
 */
async function sendPushNotification(pushToken, title, body, data = {}) {
  if (!pushToken || !pushToken.startsWith('ExponentPushToken')) {
    console.log('[PUSH] Invalid token:', pushToken);
    return { success: false, error: 'Invalid token' };
  }

  const message = {
    to: pushToken,
    sound: 'default',
    title: title,
    body: body,
    data: data,
  };

  return new Promise((resolve) => {
    const postData = JSON.stringify([message]);

    const options = {
      hostname: 'exp.host',
      port: 443,
      path: '/--/api/v2/push/send',
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          console.log('[PUSH] Sent:', title, '→', result);
          resolve({ success: true, result });
        } catch (e) {
          resolve({ success: false, error: data });
        }
      });
    });

    req.on('error', (e) => {
      console.log('[PUSH] Error:', e.message);
      resolve({ success: false, error: e.message });
    });

    req.write(postData);
    req.end();
  });
}

/**
 * Send notification to all registered devices for a given device_id
 * @param {object} supabase - Supabase client
 * @param {string} deviceId - Device ID (e.g., 'papaji_tractor_01')
 * @param {string} title - Notification title
 * @param {string} body - Notification body
 */
async function notifyDevice(supabase, deviceId, title, body, data = {}) {
  try {
    const { data: tokens, error } = await supabase
      .from('device_tokens')
      .select('token')
      .eq('device_id', deviceId);

    if (error || !tokens || tokens.length === 0) {
      console.log('[PUSH] No tokens found for device:', deviceId);
      return;
    }

    for (const t of tokens) {
      await sendPushNotification(t.token, title, body, data);
    }
  } catch (e) {
    console.log('[PUSH] notifyDevice error:', e.message);
  }
}

module.exports = {
  sendPushNotification,
  notifyDevice
};
