const http = require('http');

const data = JSON.stringify({
  device_id: 'test_tractor_01',
  latitude: 30.7333,
  longitude: 76.7794,
  speed_kmh: 15.5,
  battery_voltage: 4.2
});

const options = {
  hostname: 'localhost',
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

// Write data to request body
req.write(data);
req.end();
