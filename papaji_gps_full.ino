/**
 * ============================================
 * PAPAJI GPS TRACKER - FIRMWARE v2.0 (CLEAN)
 * ============================================
 * Board: ESP32 Dev Module
 * Modules: NEO-6M GPS + SIM800L GSM
 * 
 * Features:
 *   - Real-time GPS tracking with GSM fallback
 *   - Offline data buffering (SPIFFS)
 *   - SMS location commands (send "loc")
 *   - Auto-reconnect on network failure
 *   - Corner detection for accurate routes
 */

// ============================================
// INCLUDES
// ============================================
#define TINY_GSM_MODEM_SIM800
#include <TinyGsmClient.h>
#include <TinyGPS++.h>
#include <ArduinoJson.h>
#include <HardwareSerial.h>
#include <esp_task_wdt.h>
#include <esp_arduino_version.h>
#include <FS.h>
#include <SPIFFS.h>

// ============================================
// CONFIGURATION
// ============================================

// Network
const char APN[]        = "airtelgprs.com";
const char APN_USER[]   = "";
const char APN_PASS[]   = "";

// Server
const char SERVER_IP[]  = "3.27.84.253";
const int  SERVER_PORT  = 3000;
const char ENDPOINT[]   = "/api/telemetry";

// Device
const String DEVICE_ID  = "papaji_tractor_01";

// Owner Phone Numbers (for SMS replies)
const char* OWNER_PHONE[] = { "+919939630600", "+917903636910" };
const int   OWNER_COUNT   = 2;

// ============================================
// PIN DEFINITIONS
// ============================================
#define GPS_RX  4
#define GPS_TX  5
#define GSM_RX  16
#define GSM_TX  17

// ============================================
// TIMING CONSTANTS
// ============================================
const unsigned long SEND_INTERVAL_MOVING   = 5000;   // 5s when moving
const unsigned long SEND_INTERVAL_IDLE     = 10000;  // 10s when idle
const unsigned long SMS_CHECK_INTERVAL     = 10000;  // Check SMS every 10s
const unsigned long RECONNECT_INTERVAL     = 10000;  // Retry network every 10s
const unsigned long DATA_STALL_TIMEOUT     = 180000; // Force reconnect after 3 min no data
const unsigned long HARD_RESET_TIMEOUT     = 300000; // Restart ESP after 5 min offline
const unsigned long GPS_MAX_AGE            = 30000;  // GPS data stale after 30s
const int           GPS_MIN_SATELLITES     = 3;
const float         GPS_MAX_HDOP           = 10.0;
const double        CORNER_THRESHOLD_DEG   = 30.0;   // Detect turns > 30°
const int           WDT_TIMEOUT_SEC        = 120;

// ============================================
// OBJECTS
// ============================================
TinyGPSPlus gps;
HardwareSerial gpsSerial(1);
HardwareSerial gsmSerial(2);
TinyGsm modem(gsmSerial);
TinyGsmClient client(modem);

// ============================================
// STATE VARIABLES
// ============================================
unsigned long lastSendTime          = 0;
unsigned long lastSmsCheckTime      = 0;
unsigned long lastReconnectAttempt  = 0;
unsigned long lastSuccessfulUpload  = 0;
unsigned long lastConnectionSuccess = 0;

double lastLat     = 0;
double lastLon     = 0;
double lastHeading = 0;

// JSON Batch Buffer
StaticJsonDocument<4096> batchDoc;
JsonArray batchArray = batchDoc.to<JsonArray>();

// ============================================
// FUNCTION DECLARATIONS
// ============================================
void setupWatchdog();
void connectNetwork();
void maintainNetwork();
void collectAndSend();
void bufferData(float lat, float lon, float speed, const char* source, int signal, float hdop, int sats);
void flushBatch();
bool uploadJson(const String& json);
void saveOffline(const String& data);
void processOfflineQueue();
void checkSms();
void sendLocationSms();
void sendSms(const char* number, const String& message);
bool hasFreshGpsFix();
String getTimestamp();

// ============================================
// SETUP
// ============================================
void setup() {
  Serial.begin(115200);
  Serial.println("\n========================================");
  Serial.println("   PAPAJI GPS TRACKER v2.0");
  Serial.println("========================================");

  // Initialize SPIFFS for offline storage
  if (!SPIFFS.begin(true)) {
    Serial.println("[ERROR] SPIFFS mount failed");
  }

  // Setup Watchdog
  setupWatchdog();

  // Initialize Serial ports
  gpsSerial.setRxBufferSize(1024);
  gpsSerial.begin(9600, SERIAL_8N1, GPS_RX, GPS_TX);
  gsmSerial.begin(9600, SERIAL_8N1, GSM_RX, GSM_TX);

  // Initialize GSM Modem
  Serial.println("[GSM] Initializing modem...");
  esp_task_wdt_reset();
  modem.restart();

  // Disable sleep mode
  modem.sendAT("+CSCLK=0");
  modem.waitResponse();

  // Connect to network
  connectNetwork();
  
  Serial.println("[READY] System initialized");
  delay(2000);
}

// ============================================
// MAIN LOOP
// ============================================
void loop() {
  esp_task_wdt_reset();

  // 1. Read GPS data continuously
  while (gpsSerial.available() > 0) {
    gps.encode(gpsSerial.read());
  }

  // 2. Maintain network connection
  maintainNetwork();

  // 3. Check for incoming SMS commands
  if (millis() - lastSmsCheckTime > SMS_CHECK_INTERVAL) {
    checkSms();
    lastSmsCheckTime = millis();
  }

  // 4. Collect and send data at intervals
  unsigned long interval = (hasFreshGpsFix() && gps.speed.kmph() >= 2.0) 
                           ? SEND_INTERVAL_MOVING 
                           : SEND_INTERVAL_IDLE;

  // Corner detection - force immediate send on sharp turns
  bool cornerDetected = false;
  if (hasFreshGpsFix() && gps.speed.kmph() > 5.0) {
    double heading = gps.course.deg();
    double diff = abs(heading - lastHeading);
    if (diff > 180) diff = 360 - diff;
    if (diff > CORNER_THRESHOLD_DEG) {
      cornerDetected = true;
      Serial.println("[GPS] Corner detected!");
    }
  }

  if (millis() - lastSendTime > interval || cornerDetected) {
    collectAndSend();
    lastSendTime = millis();
    if (cornerDetected) flushBatch();
  }
}

// ============================================
// WATCHDOG SETUP
// ============================================
void setupWatchdog() {
  #if ESP_ARDUINO_VERSION >= ESP_ARDUINO_VERSION_VAL(3, 0, 0)
    esp_task_wdt_deinit();
    esp_task_wdt_config_t cfg = { .timeout_ms = WDT_TIMEOUT_SEC * 1000, .trigger_panic = true };
    esp_task_wdt_init(&cfg);
  #else
    esp_task_wdt_init(WDT_TIMEOUT_SEC, true);
  #endif
  esp_task_wdt_add(NULL);
}

// ============================================
// NETWORK FUNCTIONS
// ============================================
void connectNetwork() {
  esp_task_wdt_reset();
  
  Serial.print("[GSM] Waiting for network...");
  if (!modem.waitForNetwork(60000L)) {
    Serial.println(" FAILED");
    return;
  }
  Serial.println(" OK");

  Serial.printf("[GSM] Signal: %d\n", modem.getSignalQuality());

  Serial.print("[GSM] Connecting GPRS...");
  if (!modem.gprsConnect(APN, APN_USER, APN_PASS)) {
    Serial.println(" FAILED");
  } else {
    Serial.println(" OK");
    lastConnectionSuccess = millis();
    lastSuccessfulUpload = millis();
  }
}

void maintainNetwork() {
  // Force reconnect if no data uploaded for too long
  if (millis() - lastSuccessfulUpload > DATA_STALL_TIMEOUT) {
    Serial.println("[NET] Data stall detected, forcing reconnect...");
    modem.gprsDisconnect();
    lastSuccessfulUpload = millis();
    lastConnectionSuccess = 0;
  }

  if (modem.isGprsConnected()) {
    lastConnectionSuccess = millis();
    return;
  }

  // Hard reset if offline too long
  if (millis() - lastConnectionSuccess > HARD_RESET_TIMEOUT) {
    Serial.println("[NET] Offline too long, restarting...");
    delay(1000);
    ESP.restart();
  }

  // Try to reconnect
  if (millis() - lastReconnectAttempt > RECONNECT_INTERVAL) {
    lastReconnectAttempt = millis();
    Serial.println("[NET] Attempting reconnect...");
    
    if (!modem.isNetworkConnected()) {
      modem.waitForNetwork(3000L);
    }
    if (modem.isNetworkConnected()) {
      modem.gprsConnect(APN, APN_USER, APN_PASS);
    }
  }
}

// ============================================
// DATA COLLECTION
// ============================================
void collectAndSend() {
  float lat = 0, lon = 0, speed = 0;
  float hdop = 99.0;
  int satellites = 0;
  const char* source = "none";
  int signal = modem.getSignalQuality();

  if (hasFreshGpsFix()) {
    // GPS Fix
    double currentLat = gps.location.lat();
    double currentLon = gps.location.lng();
    speed = gps.speed.kmph();

    // Initialize last position
    if (lastLat == 0 && lastLon == 0) {
      lastLat = currentLat;
      lastLon = currentLon;
    }

    // Drift filter: ignore small movements when stationary
    double dist = TinyGPSPlus::distanceBetween(currentLat, currentLon, lastLat, lastLon);
    if (speed < 3.0 && dist < 15.0) {
      lat = lastLat;
      lon = lastLon;
      speed = 0;
    } else {
      lat = currentLat;
      lon = currentLon;
      lastLat = currentLat;
      lastLon = currentLon;
    }

    source = "gps";
    lastHeading = gps.course.deg();
    if (gps.hdop.isValid()) hdop = gps.hdop.hdop();
    if (gps.satellites.isValid()) satellites = gps.satellites.value();

    Serial.printf("[GPS] %.6f, %.6f | HDOP: %.1f | Sats: %d\n", lat, lon, hdop, satellites);

  } else {
    // GSM Fallback
    Serial.println("[GPS] No fix, trying GSM location...");
    float gsmLat, gsmLon, accuracy;
    int year, month, day, hour;

    if (modem.getGsmLocation(&gsmLat, &gsmLon, &accuracy, &year, &month, &day, &hour)) {
      lat = gsmLat;
      lon = gsmLon;
      source = "gsm";
      Serial.printf("[GSM] %.6f, %.6f | Accuracy: %.0fm\n", lat, lon, accuracy);
    } else {
      Serial.println("[GSM] Location failed");
    }
  }

  // Buffer data if we have a valid location
  if (strcmp(source, "none") != 0) {
    bufferData(lat, lon, speed, source, signal, hdop, satellites);
  }
}

bool hasFreshGpsFix() {
  if (!gps.location.isValid()) return false;
  if (gps.location.age() > GPS_MAX_AGE) return false;
  if (gps.satellites.isValid() && gps.satellites.value() < GPS_MIN_SATELLITES) return false;
  if (gps.hdop.isValid() && gps.hdop.hdop() > GPS_MAX_HDOP) return false;
  return true;
}

String getTimestamp() {
  if (gps.date.isValid() && gps.time.isValid()) {
    char buf[25];
    sprintf(buf, "%04d-%02d-%02dT%02d:%02d:%02dZ",
      gps.date.year(), gps.date.month(), gps.date.day(),
      gps.time.hour(), gps.time.minute(), gps.time.second());
    return String(buf);
  }
  return "";
}

// ============================================
// DATA BUFFERING & UPLOAD
// ============================================
void bufferData(float lat, float lon, float speed, const char* source, int signal, float hdop, int sats) {
  JsonObject obj = batchArray.createNestedObject();
  obj["device_id"]       = DEVICE_ID;
  obj["latitude"]        = lat;
  obj["longitude"]       = lon;
  obj["speed_kmh"]       = speed;
  obj["source"]          = source;
  obj["signal"]          = signal;
  obj["hdop"]            = hdop;
  obj["satellites"]      = sats;
  obj["battery_voltage"] = 4.0;

  String ts = getTimestamp();
  if (ts != "") obj["timestamp"] = ts;

  flushBatch();
}

void flushBatch() {
  if (batchArray.size() == 0) return;

  String json;
  serializeJson(batchArray, json);

  if (modem.isGprsConnected() && uploadJson(json)) {
    batchArray.clear();
    processOfflineQueue();
  } else {
    saveOffline(json);
    batchArray.clear();
  }
}

bool uploadJson(const String& json) {
  if (!client.connect(SERVER_IP, SERVER_PORT)) {
    Serial.println("[HTTP] Connection failed");
    modem.gprsDisconnect();
    return false;
  }

  client.print("POST "); client.print(ENDPOINT); client.println(" HTTP/1.1");
  client.print("Host: "); client.println(SERVER_IP);
  client.println("Content-Type: application/json");
  client.println("Connection: close");
  client.print("Content-Length: "); client.println(json.length());
  client.println();
  client.println(json);

  // Read response
  bool success = false;
  unsigned long timeout = millis();
  
  while (client.connected() && millis() - timeout < 7000) {
    if (client.available()) {
      String line = client.readStringUntil('\n');
      if (line == "\r") break;
    }
  }

  if (client.connected()) {
    String body = client.readStringUntil('\n');
    if (body.indexOf("ok") != -1) {
      success = true;
      lastSuccessfulUpload = millis();
    }
    if (body.indexOf("reset") != -1) {
      Serial.println("[CMD] Reset requested");
      delay(1000);
      ESP.restart();
    }
    if (body.indexOf("reconnect") != -1) {
      Serial.println("[CMD] Reconnect requested");
      modem.gprsDisconnect();
    }
  }

  client.stop();
  return success;
}

// ============================================
// OFFLINE STORAGE
// ============================================
void saveOffline(const String& data) {
  File file = SPIFFS.open("/offline.txt", FILE_APPEND);
  if (file) {
    file.println(data);
    file.close();
    Serial.println("[OFFLINE] Data saved");
  }
}

void processOfflineQueue() {
  if (!SPIFFS.exists("/offline.txt")) return;
  
  SPIFFS.rename("/offline.txt", "/processing.txt");
  File file = SPIFFS.open("/processing.txt", FILE_READ);
  if (!file) return;

  while (file.available()) {
    String line = file.readStringUntil('\n');
    line.trim();
    if (line.length() > 0) {
      if (!uploadJson(line)) {
        // Failed - save remaining back to offline
        File backup = SPIFFS.open("/offline.txt", FILE_APPEND);
        if (backup) {
          backup.println(line);
          while (file.available()) backup.println(file.readStringUntil('\n'));
          backup.close();
        }
        break;
      }
    }
  }
  
  file.close();
  SPIFFS.remove("/processing.txt");
}

// ============================================
// SMS FUNCTIONS
// ============================================
void checkSms() {
  String response = "";
  modem.sendAT("+CMGF=1");
  modem.waitResponse();

  modem.sendAT("+CMGL=\"REC UNREAD\"");
  if (modem.waitResponse(10000L, response) == 1) {
    if (response.indexOf("+CMGL:") != -1) {
      Serial.println("[SMS] New message received");

      // Forward to server
      StaticJsonDocument<2048> doc;
      doc["device_id"] = DEVICE_ID;
      doc["raw_response"] = response;
      
      String json;
      serializeJson(doc, json);

      if (client.connect(SERVER_IP, SERVER_PORT)) {
        client.println("POST /api/sms/incoming HTTP/1.1");
        client.print("Host: "); client.println(SERVER_IP);
        client.println("Content-Type: application/json");
        client.println("Connection: close");
        client.print("Content-Length: "); client.println(json.length());
        client.println();
        client.println(json);
        
        delay(2000);
        client.stop();
        Serial.println("[SMS] Forwarded to server");
      }

      // Handle "loc" command
      response.toLowerCase();
      if (response.indexOf("loc") != -1) {
        Serial.println("[SMS] Location request received");
        sendLocationSms();
      }

      // Delete all SMS
      modem.sendAT("+CMGDA=\"DEL ALL\"");
      modem.waitResponse();
    }
  }
}

void sendLocationSms() {
  String message;

  if (hasFreshGpsFix()) {
    float lat = gps.location.lat();
    float lon = gps.location.lng();
    float spd = gps.speed.kmph();
    int sats = gps.satellites.isValid() ? gps.satellites.value() : 0;
    float hdop = gps.hdop.isValid() ? gps.hdop.hdop() : 99.0;

    message = "Papaji Tractor GPS:\n";
    message += "https://maps.google.com/?q=" + String(lat, 6) + "," + String(lon, 6) + "\n";
    message += "Speed: " + String(spd, 1) + " km/h\n";
    message += "Sats: " + String(sats) + "\n";
    message += "Accuracy: ";
    if (hdop < 1) message += "Excellent";
    else if (hdop < 2) message += "Very Good";
    else if (hdop < 5) message += "Good";
    else message += "Poor";
  } else {
    float gsmLat, gsmLon, accuracy;
    int y, m, d, h;
    if (modem.getGsmLocation(&gsmLat, &gsmLon, &accuracy, &y, &m, &d, &h)) {
      message = "Papaji Tractor (GSM):\n";
      message += "https://maps.google.com/?q=" + String(gsmLat, 6) + "," + String(gsmLon, 6) + "\n";
      message += "Accuracy: ~" + String(accuracy, 0) + "m";
    } else {
      message = "Papaji Tractor:\nLocation unavailable. Try again later.";
    }
  }

  // Send to all owners
  for (int i = 0; i < OWNER_COUNT; i++) {
    Serial.printf("[SMS] Sending to %s\n", OWNER_PHONE[i]);
    sendSms(OWNER_PHONE[i], message);
    delay(2000);
  }
}

void sendSms(const char* number, const String& message) {
  modem.sendAT("+CMGF=1");
  modem.waitResponse();
  modem.sendAT(String("+CMGS=\"") + number + "\"");
  if (modem.waitResponse(5000L, ">") == 1) {
    modem.stream.print(message);
    modem.stream.write(0x1A);
    modem.waitResponse(10000L);
  }
}
