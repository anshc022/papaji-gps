/*
 * Papaji GPS Tracker Firmware - FIXED & CLEANED
 * Board: ESP32 Dev Module
 * Modules: NEO-6M GPS, SIM800L GSM
 * 
 * FIXES:
 * 1. Drift filter now uses time-based reset (stale location after 5 mins)
 * 2. Better debug output for troubleshooting
 * 3. Removed unused code
 * 4. Added data send confirmation logs
 */

#define TINY_GSM_MODEM_SIM800
#include <TinyGsmClient.h>
#include <TinyGPS++.h>
#include <ArduinoJson.h>
#include <HardwareSerial.h>
#include <esp_task_wdt.h>
#include <esp_arduino_version.h>
#include <FS.h>
#include <SPIFFS.h>

// --- CONFIGURATION ---
const char apn[]      = "airtelgprs.com"; 
const char gprsUser[] = "";
const char gprsPass[] = "";

const char server[]   = "3.27.84.253"; 
const int  port       = 3000;
const char resource[] = "/api/telemetry";

const String DEVICE_ID = "papaji_tractor_01";
const int WDT_TIMEOUT = 120; 

// --- Network Config ---
unsigned long lastReconnectAttempt = 0;
const unsigned long RECONNECT_INTERVAL = 10000;
unsigned long lastConnectionSuccess = 0;
const unsigned long HARD_RESET_INTERVAL = 300000; // 5 Minutes

// --- PINS ---
#define GSM_RX 16 
#define GSM_TX 17 
#define GPS_RX 4 
#define GPS_TX 5 

// --- OBJECTS ---
TinyGPSPlus gps;
HardwareSerial gpsSerial(1); 
HardwareSerial gsmSerial(2); 

TinyGsm modem(gsmSerial);
TinyGsmClient client(modem);

unsigned long lastSend = 0;
unsigned long currentInterval = 5000;
unsigned long lastSMSCheck = 0;
const unsigned long SMS_CHECK_INTERVAL = 10000;

// Drift Filter & Cornering
double lastHeading = 0;
double lastLat = 0; 
double lastLon = 0;
unsigned long lastLocationUpdateTime = 0; // NEW: Track when location was last updated
const double CORNER_THRESHOLD = 30.0;
const unsigned long LOCATION_STALE_MS = 300000; // 5 minutes - reset drift filter after this

// Batching
const int BATCH_SIZE = 1; 
DynamicJsonDocument batchDoc(8192);
JsonArray batchArray = batchDoc.to<JsonArray>();

// Forward Declarations
void connectToNetwork();
void maintainNetwork();
void sendSMS(String number, String message);
void bufferData(float lat, float lon, float speed, String source, int signal, float hdop, int sats);
void flushBatch();
bool sendRawJson(String jsonString);
void saveOffline(String data);
void processOfflineData();
void checkSMS();
void sendLocationSMS();

// SMS Config
const char* OWNER_PHONE_1 = "+919939630600";
const char* OWNER_PHONE_2 = "+917903636910";

// GPS Quality / Freshness
const unsigned long GPS_MAX_AGE_MS = 30000;
const int GPS_MIN_SATS = 3;
const float GPS_MAX_HDOP = 10.0;

// Counters for debugging
unsigned long successfulSends = 0;
unsigned long failedSends = 0;
unsigned long offlineSaves = 0;

bool hasFreshGpsFix();

void setup() {
  Serial.begin(115200);
  Serial.println("\n========================================");
  Serial.println("   PAPAJI GPS TRACKER - Starting...");
  Serial.println("========================================");

  if(!SPIFFS.begin(true)){
    Serial.println("[ERROR] SPIFFS Mount Failed");
  } else {
    Serial.println("[OK] SPIFFS Mounted");
  }

  // Watchdog
  #if ESP_ARDUINO_VERSION >= ESP_ARDUINO_VERSION_VAL(3, 0, 0)
    esp_task_wdt_deinit();
    esp_task_wdt_config_t wdt_config = { .timeout_ms = WDT_TIMEOUT * 1000, .trigger_panic = true };
    esp_task_wdt_init(&wdt_config);
  #else
    esp_task_wdt_init(WDT_TIMEOUT, true);
  #endif
  esp_task_wdt_add(NULL);
  Serial.println("[OK] Watchdog Initialized");

  gpsSerial.setRxBufferSize(1024);
  gpsSerial.begin(9600, SERIAL_8N1, GPS_RX, GPS_TX);
  gsmSerial.begin(9600, SERIAL_8N1, GSM_RX, GSM_TX);
  Serial.println("[OK] Serial Ports Initialized");

  Serial.println("[...] Initializing modem...");
  esp_task_wdt_reset();
  
  // Power stabilization delay for SIM800L
  Serial.println("[...] Waiting for modem power stabilization...");
  delay(3000);
  
  modem.restart();
  delay(3000); // Extra delay after restart
  
  // Test modem communication first
  Serial.print("[NET] Testing modem communication... ");
  if (modem.testAT()) {
    Serial.println("OK");
  } else {
    Serial.println("FAIL - Check power supply!");
  }
  
  connectToNetwork();
  
  Serial.println("[OK] Setup Complete. Starting main loop...\n");
  delay(2000); 
}

void connectToNetwork() {
  esp_task_wdt_reset();
  
  // Check signal first
  int sig = modem.getSignalQuality();
  Serial.printf("[NET] Signal Quality: %d/31\n", sig);
  
  if (sig == 0) {
    Serial.println("[NET] No signal! Check: SIM card, antenna, power supply");
    return;
  }
  
  Serial.print("[NET] Checking Network Registration...");
  if (!modem.waitForNetwork(30000L)) { // Reduced from 60s to 30s
    Serial.println(" FAIL");
    return;
  }
  Serial.println(" OK");

  Serial.print("[NET] Connecting to APN: ");
  if (!modem.gprsConnect(apn, gprsUser, gprsPass)) {
    Serial.println("FAIL");
  } else {
    Serial.println("SUCCESS");
    lastConnectionSuccess = millis();
  }
}

void loop() {
  esp_task_wdt_reset();

  // Read GPS data continuously
  while (gpsSerial.available() > 0) {
    gps.encode(gpsSerial.read());
  }

  // Network Maintenance (non-blocking)
  maintainNetwork();

  // Check for incoming SMS
  if (millis() - lastSMSCheck > SMS_CHECK_INTERVAL) {
    checkSMS();
    lastSMSCheck = millis();
  }

  // Smart Interval based on movement
  currentInterval = (hasFreshGpsFix() && gps.speed.kmph() >= 2.0) ? 5000 : 10000;

  // Smart Cornering Detection
  bool forceSend = false;
  if (hasFreshGpsFix() && gps.speed.kmph() > 5.0) {
      double currentHeading = gps.course.deg();
      double diff = abs(currentHeading - lastHeading);
      if (diff > 180) diff = 360 - diff;
      
      if (diff > CORNER_THRESHOLD) {
          forceSend = true;
          Serial.println("[GPS] Corner detected! Force sending...");
      }
  }

  // Main Send Logic
  if (millis() - lastSend > currentInterval || forceSend) {
    float lat = 0, lon = 0, speed = 0;
    float hdop = 99.0;
    int satellites = 0;
    String source = "none";
    int signalQuality = modem.getSignalQuality();

    if (hasFreshGpsFix()) {
      speed = gps.speed.kmph();
      double currentLat = gps.location.lat();
      double currentLon = gps.location.lng();

      // FIXED: Reset drift filter if last location is stale (>5 mins old)
      if (lastLocationUpdateTime == 0 || (millis() - lastLocationUpdateTime > LOCATION_STALE_MS)) {
         Serial.println("[GPS] Drift filter reset (stale location)");
         lastLat = currentLat;
         lastLon = currentLon;
         lastLocationUpdateTime = millis();
      }

      double dist = TinyGPSPlus::distanceBetween(currentLat, currentLon, lastLat, lastLon);

      // FIXED Drift Filter: Only apply if moving slowly AND location is fresh
      if (speed < 3.0 && dist < 15.0 && (millis() - lastLocationUpdateTime < LOCATION_STALE_MS)) {
         // Stationary - use last known good position to avoid drift
         lat = lastLat; 
         lon = lastLon;
         speed = 0;
      } else {
         // Moving or location was stale - use new position
         lat = currentLat;
         lon = currentLon;
         lastLat = currentLat;
         lastLon = currentLon;
         lastLocationUpdateTime = millis(); // Update timestamp
      }
      
      source = "gps";
      lastHeading = gps.course.deg();
      
      if (gps.hdop.isValid()) hdop = gps.hdop.hdop();
      if (gps.satellites.isValid()) satellites = gps.satellites.value();
      
      Serial.printf("[GPS] FIX: %.6f, %.6f | Speed: %.1f km/h | HDOP: %.1f | Sats: %d\n", 
                    lat, lon, speed, hdop, satellites);
    } else {
      // GSM Fallback
      float gsmLat = 0, gsmLon = 0, accuracy = 0;
      int year = 0, month = 0, day = 0, time = 0;
      
      Serial.println("[GPS] No fix. Trying GSM Location...");
      
      if (modem.getGsmLocation(&gsmLat, &gsmLon, &accuracy, &year, &month, &day, &time)) {
        // FIX: SIM800L sometimes returns lon,lat instead of lat,lon
        // Latitude must be between -90 and 90
        if (abs(gsmLat) > 90) {
          float temp = gsmLat;
          gsmLat = gsmLon;
          gsmLon = temp;
          Serial.println("[GSM] Coordinates were swapped - fixed!");
        }
        
        lat = gsmLat;
        lon = gsmLon;
        source = "gsm";
        Serial.printf("[GSM] FIX: %.6f, %.6f | Accuracy: %.1fm\n", lat, lon, accuracy);
      } else {
        Serial.println("[GSM] Location Failed.");
      }
    }

    // Send or Buffer Data
    if (source != "none") {
      bufferData(lat, lon, speed, source, signalQuality, hdop, satellites);
    } else {
      // Heartbeat every 60 seconds if no location
      if (millis() - lastSend > 60000) {
         Serial.println("[SYS] Sending heartbeat...");
         bufferData(0, 0, 0, "heartbeat", signalQuality, 99.0, 0);
      }
    }
    
    lastSend = millis();
    if (forceSend) flushBatch();
  }

  // Print status every 30 seconds
  static unsigned long lastStatus = 0;
  if (millis() - lastStatus > 30000) {
    lastStatus = millis();
    Serial.printf("\n[STATUS] Sends: %lu OK, %lu FAIL, %lu OFFLINE | GPRS: %s | Signal: %d\n\n",
                  successfulSends, failedSends, offlineSaves,
                  modem.isGprsConnected() ? "YES" : "NO",
                  modem.getSignalQuality());
  }
}

void saveOffline(String data) {
  File file = SPIFFS.open("/offline.txt", FILE_APPEND);
  if(file){
    file.println(data);
    file.close();
    offlineSaves++;
    Serial.println("[OFFLINE] Data saved to flash memory");
  } else {
    Serial.println("[ERROR] Failed to save offline data");
  }
}

bool sendRawJson(String jsonString) {
  Serial.println("[NET] Connecting to server...");
  
  if (!client.connect(server, port)) {
    Serial.println("[NET] Server connect FAILED");
    modem.gprsDisconnect();
    return false;
  }
  
  client.print(String("POST ") + resource + " HTTP/1.1\r\n");
  client.print(String("Host: ") + server + "\r\n");
  client.println("Connection: close");
  client.println("Content-Type: application/json");
  client.print("Content-Length: ");
  client.println(jsonString.length());
  client.println();
  client.println(jsonString);
  
  bool ok = false;
  unsigned long timeout = millis();
  
  // Wait for response
  while(client.connected() && millis() - timeout < 7000) {
    if(client.available()) {
      String line = client.readStringUntil('\n');
      if(line == "\r") break;
    }
  }
  
  if(client.connected()) {
    String line = client.readStringUntil('\n');
    if (line.indexOf("ok") != -1) {
      ok = true;
      Serial.println("[NET] Data sent SUCCESS");
    }
    if (line.indexOf("reset") != -1) {
       Serial.println("[CMD] Server requested RESET!");
       delay(1000);
       ESP.restart();
    }
    if (line.indexOf("reconnect") != -1) {
       Serial.println("[CMD] Server requested RECONNECT!");
       modem.gprsDisconnect();
    }
  }
  
  client.stop();
  return ok;
}

bool hasFreshGpsFix() {
  if (!gps.location.isValid()) return false;
  if (gps.location.age() > GPS_MAX_AGE_MS) return false;
  if (gps.satellites.isValid() && gps.satellites.value() < GPS_MIN_SATS) return false;
  if (gps.hdop.isValid() && gps.hdop.hdop() > GPS_MAX_HDOP) return false;
  return true;
}

void processOfflineData() {
  if (!SPIFFS.exists("/offline.txt")) return;
  
  Serial.println("[OFFLINE] Processing saved data...");
  SPIFFS.rename("/offline.txt", "/processing.txt");
  
  File file = SPIFFS.open("/processing.txt", FILE_READ);
  if (!file) return;

  int count = 0;
  while (file.available()) {
    String line = file.readStringUntil('\n');
    line.trim();
    if (line.length() > 0) {
      if (!sendRawJson(line)) {
        File backup = SPIFFS.open("/offline.txt", FILE_APPEND);
        if (backup) {
            backup.println(line); 
            while(file.available()) backup.println(file.readStringUntil('\n'));
            backup.close();
        }
        break; 
      }
      count++;
    }
  }
  file.close();
  SPIFFS.remove("/processing.txt");
  
  if (count > 0) {
    Serial.printf("[OFFLINE] Uploaded %d saved points\n", count);
  }
}

void bufferData(float lat, float lon, float speed, String source, int signal, float hdop, int sats) {
  JsonObject obj = batchArray.createNestedObject();
  obj["device_id"] = DEVICE_ID;
  obj["latitude"] = lat;
  obj["longitude"] = lon;
  obj["speed_kmh"] = speed;
  obj["source"] = source; 
  obj["signal"] = signal;
  obj["hdop"] = hdop;
  obj["satellites"] = sats;
  obj["battery_voltage"] = 4.0; 

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
      processOfflineData(); 
    } else {
      failedSends++;
      saveOffline(jsonString);
      batchArray.clear();
    }
  } else {
    saveOffline(jsonString);
    batchArray.clear();
  }
}

// ============ SMS FUNCTIONS ============

void checkSMS() {
  String response = "";
  modem.sendAT("+CMGF=1");
  modem.waitResponse();
  
  modem.sendAT("+CMGL=\"REC UNREAD\"");
  if (modem.waitResponse(10000L, response) == 1) {
    if (response.indexOf("+CMGL:") != -1) {
       Serial.println("[SMS] Message received!");
       
       // Forward to Server
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
          while(client.connected() && millis() - timeout < 2000) {
            if(client.available()) client.read();
          }
          client.stop();
          Serial.println("[SMS] Forwarded to server");
       }

       // Handle Commands
       response.toLowerCase();
       if (response.indexOf("loc") != -1) {
          Serial.println("[SMS] 'loc' command received!");
          sendLocationSMS();
       }
       
       // Delete all SMS
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
    float gsmLat = 0, gsmLon = 0, accuracy = 0;
    int year = 0, month = 0, day = 0, time = 0;
    if (modem.getGsmLocation(&gsmLat, &gsmLon, &accuracy, &year, &month, &day, &time)) {
      // FIX: SIM800L sometimes returns lon,lat instead of lat,lon
      if (abs(gsmLat) > 90) {
        float temp = gsmLat;
        gsmLat = gsmLon;
        gsmLon = temp;
      }
      
      message = "Papaji Tractor (GSM):\n";
      message += "https://maps.google.com/?q=" + String(gsmLat, 6) + "," + String(gsmLon, 6) + "\n";
      message += "Cell accuracy: ~" + String(accuracy, 0) + "m";
    } else {
      message = "Papaji Tractor:\nLocation unavailable. Try again later.";
    }
  }
  
  Serial.println("[SMS] Sending location to both numbers...");
  sendSMS(OWNER_PHONE_1, message);
  delay(2000); 
  sendSMS(OWNER_PHONE_2, message);
  Serial.println("[SMS] Location sent!");
}

// ============ NETWORK FUNCTIONS ============

void maintainNetwork() {
  if (modem.isGprsConnected()) {
    lastConnectionSuccess = millis();
    return;
  }

  // Hard Reset if offline too long
  if (millis() - lastConnectionSuccess > HARD_RESET_INTERVAL) {
    Serial.println("[NET] Offline 5+ mins. Restarting...");
    delay(1000);
    ESP.restart();
  }

  if (millis() - lastReconnectAttempt > RECONNECT_INTERVAL) {
    lastReconnectAttempt = millis();
    Serial.println("[NET] Reconnecting...");
    
    if (!modem.isNetworkConnected()) {
       modem.waitForNetwork(3000L);
    }
    
    if (modem.isNetworkConnected()) {
       modem.gprsConnect(apn, gprsUser, gprsPass);
    }
  }
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
