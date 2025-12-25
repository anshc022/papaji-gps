/*
 * ============================================
 * PAPAJI GPS TRACKER - GPS ONLY MODE
 * ============================================
 * Board: ESP32 Dev Module
 * GPS: NEO-6M (Real-time tracking)
 * GSM: SIM800L (Data upload & SMS)
 * 
 * Features:
 * - GPS-only positioning (no GSM fallback)
 * - Smart jitter filtering
 * - Offline data storage (SPIFFS)
 * - SMS commands (loc, status, reset)
 * - Optimized performance
 */

#define TINY_GSM_MODEM_SIM800
#include <TinyGsmClient.h>
#include <TinyGPS++.h>
#include <ArduinoJson.h>
#include <HardwareSerial.h>
#include <esp_task_wdt.h>
#include <esp_arduino_version.h>

// ============================================
// CONFIGURATION
// ============================================
const char apn[] = "airtelgprs.com";
const char gprsUser[] = "";
const char gprsPass[] = "";

const char server[] = "3.27.84.253";
const int port = 3000;
const char resource[] = "/api/telemetry";

const String DEVICE_ID = "papaji_tractor_01";
const int WDT_TIMEOUT = 120;

// GPS Quality Thresholds
const unsigned long GPS_MAX_AGE_MS = 10000; // 10s max data age
const int GPS_MIN_SATS = 3;                 // Minimum satellites
const float GPS_MAX_HDOP = 20.0;            // Max HDOP (Tightened from 50 to 20 to reduce jumping)

// Update Intervals
const unsigned long MOVING_INTERVAL = 2000;   // 2s when moving
const unsigned long STOPPED_INTERVAL = 60000; // 1min when stopped
const unsigned long SMS_CHECK_INTERVAL = 10000;

// Network Timeouts
const unsigned long RECONNECT_INTERVAL = 10000;
const unsigned long HARD_RESET_INTERVAL = 900000; // 15 mins

// ============================================
// PINS
// ============================================
#define GSM_RX 16
#define GSM_TX 17
#define GPS_RX 4
#define GPS_TX 5
#define LED_PIN 2  // Onboard LED for status

// ============================================
// GLOBAL OBJECTS
// ============================================
TinyGPSPlus gps;
HardwareSerial gpsSerial(1);
HardwareSerial gsmSerial(2);
TinyGsm modem(gsmSerial);
TinyGsmClient client(modem);

// ============================================
// STATE VARIABLES
// ============================================
unsigned long lastSend = 0;
unsigned long lastActualSend = 0;
unsigned long lastSMSCheck = 0;
unsigned long lastReconnectAttempt = 0;
unsigned long lastConnectionSuccess = 0;
unsigned long currentInterval = 5000;

// GPS State
double lastLat = 0;
double lastLon = 0;
double lastHeading = 0;
bool wasGpsLost = false;

// Statistics
unsigned long successfulSends = 0;
unsigned long failedSends = 0;

// Batching
const int BATCH_SIZE = 1;
DynamicJsonDocument batchDoc(8192);
JsonArray batchArray = batchDoc.to<JsonArray>();

// SMS Config
const char* OWNER_PHONE_1 = "+919939630600";
const char* OWNER_PHONE_2 = "+917903636910";

// ============================================
// FUNCTION DECLARATIONS
// ============================================
bool hasFreshGpsFix();
void connectToNetwork();
void maintainNetwork();
void bufferData(float lat, float lon, float speed, String source, int signal, float hdop, int sats, String timestamp);
void flushBatch();
bool sendRawJson(String jsonString);
void checkSMS();
void sendLocationSMS();
void sendSMS(String number, String message);

// ============================================
// SETUP
// ============================================
void setup() {
  Serial.begin(115200);
  Serial.println("\n========================================");
  Serial.println("   PAPAJI GPS TRACKER - GPS ONLY MODE");
  Serial.println("========================================");

  // Watchdog Timer
  #if ESP_ARDUINO_VERSION >= ESP_ARDUINO_VERSION_VAL(3, 0, 0)
    esp_task_wdt_deinit();
    esp_task_wdt_config_t wdt_config = {.timeout_ms = WDT_TIMEOUT * 1000, .trigger_panic = true};
    esp_task_wdt_init(&wdt_config);
  #else
    esp_task_wdt_init(WDT_TIMEOUT, true);
  #endif
  esp_task_wdt_add(NULL);
  Serial.println("[OK] Watchdog Initialized");

  // Serial Ports
  gpsSerial.setRxBufferSize(1024);
  gpsSerial.begin(9600, SERIAL_8N1, GPS_RX, GPS_TX);
  gsmSerial.begin(9600, SERIAL_8N1, GSM_RX, GSM_TX);
  
  // LED Setup
  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, LOW); // Start OFF
  
  Serial.println("[OK] Serial Ports & LED Ready");

  // Initialize Modem
  Serial.println("[...] Initializing modem...");
  esp_task_wdt_reset();
  delay(3000); // Power stabilization
  
  modem.restart();
  delay(3000);
  
  if (modem.testAT()) {
    Serial.println("[OK] Modem communication OK");
  } else {
    Serial.println("[WARN] Modem test failed - check power!");
  }
  
  connectToNetwork();
  
  Serial.println("[OK] Setup Complete\n");
  delay(2000);
}

// ============================================
// MAIN LOOP
// ============================================
void loop() {
  esp_task_wdt_reset();

  // Process GPS data
  while (gpsSerial.available() > 0) {
    gps.encode(gpsSerial.read());
  }

  // Network maintenance
  maintainNetwork();

  // Check SMS
  if (millis() - lastSMSCheck > SMS_CHECK_INTERVAL) {
    checkSMS();
    lastSMSCheck = millis();
  }

  // Get GPS status
  bool gpsValid = hasFreshGpsFix();
  
  // LED Status Logic
  // Fast Blink (100ms) = Searching for GPS
  // Slow Blink (1000ms) = GPS Locked & Working
  static unsigned long lastBlink = 0;
  static bool ledState = false;
  unsigned long blinkInterval = gpsValid ? 1000 : 100;
  
  if (millis() - lastBlink > blinkInterval) {
    lastBlink = millis();
    ledState = !ledState;
    digitalWrite(LED_PIN, ledState);
  }
  
  if (!gpsValid) {
    wasGpsLost = true;
    currentInterval = STOPPED_INTERVAL;
    
    // Debug print for GPS searching
    static unsigned long lastSearchPrint = 0;
    if (millis() - lastSearchPrint > 5000) {
      lastSearchPrint = millis();
      Serial.printf("[GPS] Searching... Sats: %d | HDOP: %.1f\n", 
        gps.satellites.isValid() ? gps.satellites.value() : 0,
        gps.hdop.isValid() ? gps.hdop.hdop() : 99.0);
    }

    // GSM Fallback (LBS)
    // If GPS is lost, try to get location from Cell Towers
    if (millis() - lastSend > currentInterval) {
      float gLat = 0, gLon = 0, gAcc = 0;
      int gYear = 0, gMonth = 0, gDay = 0, gHour = 0, gMin = 0, gSec = 0;
      
      // Try to get GSM location
      if (modem.getGsmLocation(&gLat, &gLon, &gAcc, &gYear, &gMonth, &gDay, &gHour, &gMin, &gSec)) {
         // Fix: SIM800 sometimes returns Longitude first. Swap if needed for India.
         if (gLat > 60.0 && gLon < 60.0) {
            float temp = gLat;
            gLat = gLon;
            gLon = temp;
         }

         Serial.printf("[GSM] LBS Location: %.6f, %.6f | Acc: %.1f\n", gLat, gLon, gAcc);
         
         String ts = "";
         if (gYear > 2000) {
            char tsBuffer[25];
            sprintf(tsBuffer, "%04d-%02d-%02dT%02d:%02d:%02dZ", gYear, gMonth, gDay, gHour, gMin, gSec);
            ts = String(tsBuffer);
         }
         
         bufferData(gLat, gLon, 0, "gsm", modem.getSignalQuality(), 99.0, 0, ts);
         lastSend = millis();
         lastActualSend = millis();
      }
    }
    
    // Heartbeat every 2 minutes
    if (millis() - lastActualSend > 120000) {
      Serial.println("[GPS] No fix - sending heartbeat");
      bufferData(0, 0, 0, "heartbeat", modem.getSignalQuality(), 99.0, 0, "");
      lastSend = millis();
      lastActualSend = millis();
    }
    return;
  }

  // GPS is valid - get data
  float lat = gps.location.lat();
  float lon = gps.location.lng();
  float speed = gps.speed.kmph();
  float heading = gps.course.deg();
  float hdop = gps.hdop.isValid() ? gps.hdop.hdop() : 99.0;
  int satellites = gps.satellites.isValid() ? gps.satellites.value() : 0;

  // Calculate distance from last point
  double dist = 0;
  if (lastLat != 0 && lastLon != 0) {
    dist = TinyGPSPlus::distanceBetween(lat, lon, lastLat, lastLon);
  }

  // Smart jitter filter (Static Navigation)
  // If speed is low and distance is small, we are likely just drifting.
  // Lock coordinates to the last known good position.
  if (speed < 5.0 && dist < 20.0) {
    // Stationary - Clamp to last known position
    speed = 0;
    if (lastLat != 0 && lastLon != 0) {
      lat = lastLat;
      lon = lastLon;
    }
  }
  
  // Dynamic interval based on speed
  if (speed > 2.0) {
    currentInterval = MOVING_INTERVAL;
  } else {
    currentInterval = STOPPED_INTERVAL;
  }

  // Determine if we should send
  bool timeTrigger = (millis() - lastSend > currentInterval) || (lastSend == 0);
  bool distTrigger = false;
  bool cornerTrigger = false;
  bool gpsRestoredTrigger = false;
  bool forceHeartbeat = (millis() - lastActualSend > 120000);

  // GPS restored trigger
  if (gpsValid && wasGpsLost) {
    gpsRestoredTrigger = true;
    wasGpsLost = false;
    Serial.println("[GPS] *** GPS RESTORED ***");
  }

  // Distance trigger
  if (speed > 3.0 && dist > 15.0) {
    distTrigger = true;
  } else if (dist > 25.0) {
    distTrigger = true;
  }

  // Corner detection
  double headDiff = abs(heading - lastHeading);
  if (headDiff > 180) headDiff = 360 - headDiff;
  if (speed > 5.0 && headDiff > 30.0 && millis() - lastSend > 2000) {
    cornerTrigger = true;
  }

  // Duplicate filter - skip if time trigger only and not moved
  if (timeTrigger && !distTrigger && !cornerTrigger && !gpsRestoredTrigger && !forceHeartbeat && dist < 15.0 && lastSend != 0) {
    lastSend = millis();
    return;
  }

  // Send data
  if (timeTrigger || distTrigger || cornerTrigger || gpsRestoredTrigger) {
    // Get timestamp
    String ts = "";
    if (gps.date.isValid() && gps.time.isValid()) {
      char tsBuffer[25];
      sprintf(tsBuffer, "%04d-%02d-%02dT%02d:%02d:%02dZ",
              gps.date.year(), gps.date.month(), gps.date.day(),
              gps.time.hour(), gps.time.minute(), gps.time.second());
      ts = String(tsBuffer);
    }

    // Buffer and send
    int signalQuality = modem.getSignalQuality();
    bufferData(lat, lon, speed, "gps", signalQuality, hdop, satellites, ts);

    // Update state
    lastLat = lat;
    lastLon = lon;
    lastHeading = heading;
    lastSend = millis();
    lastActualSend = millis();

    Serial.printf("[GPS] %.6f, %.6f | %.1f km/h | %.1fm | HDOP: %.1f | Sats: %d\n",
                  lat, lon, speed, dist, hdop, satellites);
  }

  // Print status every 30 seconds
  static unsigned long lastStatus = 0;
  if (millis() - lastStatus > 30000) {
    lastStatus = millis();
    Serial.printf("\n[STATUS] Sends: %lu OK, %lu FAIL | GPRS: %s | Signal: %d\n\n",
                  successfulSends, failedSends,
                  modem.isGprsConnected() ? "YES" : "NO",
                  modem.getSignalQuality());
  }
}

// ============================================
// GPS VALIDATION
// ============================================
bool hasFreshGpsFix() {
  if (!gps.location.isValid()) return false;
  if (gps.location.age() > GPS_MAX_AGE_MS) return false;
  
  if (!gps.satellites.isValid()) return false;
  if (gps.satellites.value() < GPS_MIN_SATS) return false;
  if (gps.satellites.age() > GPS_MAX_AGE_MS) return false;
  
  if (gps.hdop.isValid() && gps.hdop.hdop() > GPS_MAX_HDOP) return false;
  
  return true;
}

// ============================================
// DATA HANDLING
// ============================================
void bufferData(float lat, float lon, float speed, String source, int signal, float hdop, int sats, String timestamp) {
  JsonObject obj = batchArray.createNestedObject();
  obj["device_id"] = DEVICE_ID;
  obj["latitude"] = lat;
  obj["longitude"] = lon;
  obj["speed_kmh"] = speed;
  obj["source"] = source.c_str();
  obj["signal"] = signal;
  obj["hdop"] = hdop;
  obj["satellites"] = sats;
  obj["battery_voltage"] = 4.0;
  if (timestamp != "") obj["timestamp"] = timestamp.c_str();

  Serial.printf("[BUFFER] %s | %.6f, %.6f | %.1f km/h\n", source.c_str(), lat, lon, speed);

  if (batchArray.size() >= BATCH_SIZE) flushBatch();
}

void flushBatch() {
  if (batchArray.size() == 0) return;

  String jsonString;
  serializeJson(batchArray, jsonString);

  if (modem.isGprsConnected()) {
    if (sendRawJson(jsonString)) {
      successfulSends++;
      batchArray.clear();
    } else {
      failedSends++;
      Serial.println("[NET] Send failed - Discarding data");
      batchArray.clear();
    }
  } else {
    Serial.println("[NET] No connection - Discarding data");
    batchArray.clear();
  }
}

bool sendRawJson(String jsonString) {
  if (!client.connected()) {
    Serial.println("[NET] Connecting to server...");
    if (!client.connect(server, port)) {
      Serial.println("[NET] Connection FAILED");
      return false;
    }
  }

  lastConnectionSuccess = millis();

  // Send HTTP request
  client.print(String("POST ") + resource + " HTTP/1.1\r\n");
  client.print(String("Host: ") + server + "\r\n");
  client.println("Connection: keep-alive");
  client.println("Content-Type: application/json");
  client.print("Content-Length: ");
  client.println(jsonString.length());
  client.println();
  client.println(jsonString);

  // Wait for response
  bool ok = false;
  unsigned long timeout = millis();
  
  while (client.connected() && millis() - timeout < 7000) {
    if (client.available()) {
      String line = client.readStringUntil('\n');
      if (line == "\r") break;
    }
  }

  if (client.connected()) {
    String line = client.readStringUntil('\n');
    if (line.indexOf("ok") != -1 || line.indexOf("200") != -1) {
      ok = true;
      Serial.println("[NET] Send SUCCESS");
    }
    
    // Handle server commands
    if (line.indexOf("reset") != -1) {
      Serial.println("[CMD] Server requested RESET");
      delay(1000);
      ESP.restart();
    }
    if (line.indexOf("reconnect") != -1) {
      Serial.println("[CMD] Server requested RECONNECT");
      client.stop();
      modem.gprsDisconnect();
    }
  }

  return ok;
}

// ============================================
// NETWORK MANAGEMENT
// ============================================
void connectToNetwork() {
  esp_task_wdt_reset();

  Serial.print("[NET] Waiting for network...");
  if (!modem.waitForNetwork(30000L)) {
    Serial.println(" FAIL");
  } else {
    Serial.println(" OK");
  }

  int sig = modem.getSignalQuality();
  Serial.printf("[NET] Signal: %d/31\n", sig);

  if (sig == 0 && !modem.isNetworkConnected()) {
    Serial.println("[NET] No signal! Check antenna.");
    return;
  }

  Serial.print("[NET] Connecting to APN...");
  if (!modem.gprsConnect(apn, gprsUser, gprsPass)) {
    Serial.println(" FAIL");
  } else {
    Serial.println(" SUCCESS");
    lastConnectionSuccess = millis();
  }
}

void maintainNetwork() {
  // Hard reset if no server contact for 15 mins
  if (millis() - lastConnectionSuccess > HARD_RESET_INTERVAL) {
    Serial.println("[NET] No server contact for 15+ mins. Restarting...");
    delay(1000);
    ESP.restart();
  }

  if (modem.isGprsConnected()) return;

  // Attempt reconnect
  if (millis() - lastReconnectAttempt > RECONNECT_INTERVAL) {
    lastReconnectAttempt = millis();
    Serial.println("[NET] Reconnecting...");

    if (!modem.isNetworkConnected()) {
      Serial.print("[NET] Waiting for network... ");
      if (!modem.waitForNetwork(10000L)) {
        Serial.println("FAIL");
      } else {
        Serial.println("OK");
      }
    }

    if (modem.isNetworkConnected()) {
      if (modem.gprsConnect(apn, gprsUser, gprsPass)) {
        Serial.println("[NET] GPRS Reconnected");
      }
    }
  }
}

// ============================================
// SMS FUNCTIONS
// ============================================
void checkSMS() {
  String response = "";
  modem.sendAT("+CMGF=1");
  modem.waitResponse();

  modem.sendAT("+CMGL=\"REC UNREAD\"");
  if (modem.waitResponse(10000L, response) == 1) {
    if (response.indexOf("+CMGL:") != -1) {
      Serial.println("[SMS] Message received");

      // Forward to server
      DynamicJsonDocument doc(4096);
      doc["device_id"] = DEVICE_ID;
      doc["raw_response"] = response;

      String json;
      serializeJson(doc, json);

      if (client.connect(server, port)) {
        client.print(String("POST /api/sms/incoming HTTP/1.1\r\n"));
        client.print(String("Host: ") + server + "\r\n");
        client.println("Connection: close");
        client.println("Content-Type: application/json");
        client.print("Content-Length: ");
        client.println(json.length());
        client.println();
        client.println(json);

        unsigned long timeout = millis();
        while (client.connected() && millis() - timeout < 2000) {
          if (client.available()) client.read();
        }
        client.stop();
        Serial.println("[SMS] Forwarded to server");
      }

      // Handle commands
      response.toLowerCase();
      if (response.indexOf("loc") != -1) {
        Serial.println("[SMS] 'loc' command");
        sendLocationSMS();
      } else if (response.indexOf("reset") != -1) {
        Serial.println("[SMS] 'reset' command");
        sendSMS(OWNER_PHONE_1, "Papaji Tractor: Resetting...");
        delay(2000);
        ESP.restart();
      } else if (response.indexOf("status") != -1) {
        Serial.println("[SMS] 'status' command");
        String statusMsg = "Papaji Tractor Status:\n";
        statusMsg += "GPRS: " + String(modem.isGprsConnected() ? "Connected" : "Disconnected") + "\n";
        statusMsg += "Signal: " + String(modem.getSignalQuality()) + "/31\n";
        statusMsg += "GPS: " + String(hasFreshGpsFix() ? "Yes" : "No") + "\n";
        statusMsg += "Uptime: " + String(millis() / 60000) + " mins";
        sendSMS(OWNER_PHONE_1, statusMsg);
      }

      // Delete processed SMS
      modem.sendAT("+CMGDA=\"DEL ALL\"");
      modem.waitResponse();
    }
  }
}

void sendLocationSMS() {
  String message;

  if (hasFreshGpsFix()) {
    float lat = gps.location.lat();
    float lon = gps.location.lng();
    float spd = gps.speed.kmph();
    int sats = gps.satellites.isValid() ? gps.satellites.value() : 0;
    float hdopVal = gps.hdop.isValid() ? gps.hdop.hdop() : 99.0;

    message = "Papaji Tractor GPS:\n";
    message += "https://maps.google.com/?q=" + String(lat, 6) + "," + String(lon, 6) + "\n";
    message += "Speed: " + String(spd, 1) + " km/h\n";
    message += "Sats: " + String(sats) + " | ";
    if (hdopVal < 2) message += "Accuracy: Good";
    else if (hdopVal < 5) message += "Accuracy: OK";
    else message += "Accuracy: Poor";
  } else {
    message = "Papaji Tractor:\nGPS signal not available. Please try outdoors.";
  }

  Serial.println("[SMS] Sending location...");
  sendSMS(OWNER_PHONE_1, message);
  delay(2000);
  sendSMS(OWNER_PHONE_2, message);
  Serial.println("[SMS] Location sent");
}

void sendSMS(String number, String message) {
  modem.sendAT("+CMGF=1");
  modem.waitResponse();
  modem.sendAT("+CMGS=\"" + number + "\"");
  if (modem.waitResponse(5000L, ">") == 1) {
    modem.stream.print(message);
    modem.stream.write(0x1A);
    modem.waitResponse(10000L);
  }
}
