const fetch = require('node-fetch'); // Might not be available, let's use http module for zero deps
const http = require('http');

const data = JSON.stringify({
  device_id: "papaji_tractor_01",
  latitude: 13.174640 + (Math.random() * 0.001),
  longitude: 80.097832 + (Math.random() * 0.001),
  speed_kmh: 0,
  source: "gsm",
  signal: 22,
  hdop: 99.0,
  satellites: 0,
  battery_voltage: 4.0
});

const options = {
  hostname: '3.27.84.253',
  port: 3000,
  path: '/api/telemetry',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': data.length
  }
};

const req = http.request(options, (res) => {
  console.log(`STATUS: ${res.statusCode}`);
  res.setEncoding('utf8');
  res.on('data', (chunk) => {
    console.log(`BODY: ${chunk}`);
  });
});

req.on('error', (e) => {
  console.error(`problem with request: ${e.message}`);
});

req.write(data);
req.end();
