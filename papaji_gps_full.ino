/*
 * Papaji GPS Tracker Firmware - Optimized
 * Board: ESP32 Dev Module
 * Modules: NEO-6M GPS, SIM800L GSM
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
const unsigned long RECONNECT_INTERVAL = 10000; // Reduced to 10s for faster reconnect
unsigned long lastConnectionSuccess = 0;        // Track last successful connection
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
const unsigned long SMS_CHECK_INTERVAL = 10000; // Check SMS every 10 seconds 

// Alerts
void sendAlertSMS(String message);

// Drift Filter & Cornering
double lastHeading = 0;
double lastLat = 0; 
double lastLon = 0; 
const double CORNER_THRESHOLD = 30.0; 

// Batching
const int BATCH_SIZE = 1; 
DynamicJsonDocument batchDoc(8192);
JsonArray batchArray = batchDoc.to<JsonArray>();

// Forward Declarations
void connectToNetwork();
void maintainNetwork(); // NEW
void sendSMS(String number, String message); // NEW
void bufferData(float lat, float lon, float speed, String source, int signal, float hdop, int sats);
void flushBatch();
bool sendRawJson(String jsonString);
void saveOffline(String data);
void processOfflineData();
void checkSMS();
void sendLocationSMS();

// SMS Config
const char* OWNER_PHONE = "+919939630600";

// GPS Quality / Freshness
const unsigned long GPS_MAX_AGE_MS = 30000;   // Increased to 30s to handle network blocking
const int GPS_MIN_SATS = 3;                  // Reduced to 3 for better availability
const float GPS_MAX_HDOP = 10.0;             // Relaxed accuracy requirement

bool hasFreshGpsFix();

void setup() {
  Serial.begin(115200);
  Serial.println("\nStarting Papaji GPS Tracker...");

  if(!SPIFFS.begin(true)){
    Serial.println("SPIFFS Mount Failed");
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

  gpsSerial.setRxBufferSize(1024); // Increase buffer to prevent data loss during network ops
  gpsSerial.begin(9600, SERIAL_8N1, GPS_RX, GPS_TX);
  gsmSerial.begin(9600, SERIAL_8N1, GSM_RX, GSM_TX);

  Serial.println("Initializing modem...");
  esp_task_wdt_reset();
  modem.restart();
  
  connectToNetwork();
  
  Serial.println("Waiting 3s...");
  delay(3000); 
}

void connectToNetwork() {
  esp_task_wdt_reset();
  Serial.print("Checking Network Registration...");
  if (!modem.waitForNetwork(60000L)) {
    Serial.println(" fail");
    return;
  }
  Serial.println(" OK");
  
  Serial.print("Signal Quality: ");
  Serial.println(modem.getSignalQuality());

  Serial.print("Connecting to APN: ");
  if (!modem.gprsConnect(apn, gprsUser, gprsPass)) {
    Serial.println("fail");
  } else {
    Serial.println("success");
    lastConnectionSuccess = millis(); // Initialize timer
  }
}

void loop() {
  esp_task_wdt_reset();

  while (gpsSerial.available() > 0) {
    gps.encode(gpsSerial.read());
  }

  // 1. Non-Blocking Network Maintenance
  maintainNetwork();

  // Check for incoming SMS
  if (millis() - lastSMSCheck > SMS_CHECK_INTERVAL) {
    checkSMS();
    lastSMSCheck = millis();
  }

  // Smart Interval
  // Use GPS speed only when we have a fresh fix; otherwise use a safer interval.
  currentInterval = (hasFreshGpsFix() && gps.speed.kmph() >= 2.0) ? 5000 : 10000;

  // Smart Cornering
  bool forceSend = false;
  if (hasFreshGpsFix() && gps.speed.kmph() > 5.0) {
      double currentHeading = gps.course.deg();
      double diff = abs(currentHeading - lastHeading);
      if (diff > 180) diff = 360 - diff;
      
      if (diff > CORNER_THRESHOLD) {
          forceSend = true;
          Serial.println("Corner!");
      }
  }

  if (millis() - lastSend > currentInterval || forceSend) {
    // REMOVED BLOCKING CONNECT: if (!modem.isGprsConnected()) connectToNetwork();

    float lat = 0, lon = 0, speed = 0;
    float hdop = 99.0;  // GPS accuracy (99 = no fix)
    int satellites = 0;
    String source = "none";
    int signalQuality = modem.getSignalQuality();

    if (hasFreshGpsFix()) {
      speed = gps.speed.kmph();
      double currentLat = gps.location.lat();
      double currentLon = gps.location.lng();

      if (lastLat == 0 && lastLon == 0) {
         lastLat = currentLat;
         lastLon = currentLon;
      }

      double dist = TinyGPSPlus::distanceBetween(currentLat, currentLon, lastLat, lastLon);

      // GPS Drift Filter
      if (speed < 3.0 && dist < 15.0) {
         speed = 0; 
         lat = lastLat; 
         lon = lastLon; 
      } else {
         lat = currentLat;
         lon = currentLon;
         lastLat = currentLat;
         lastLon = currentLon;
      }
      
      source = "gps";
      lastHeading = gps.course.deg();
      
      // Get GPS accuracy info
      if (gps.hdop.isValid()) hdop = gps.hdop.hdop();
      if (gps.satellites.isValid()) satellites = gps.satellites.value();
      
      Serial.printf("GPS FIX: %.6f, %.6f | HDOP: %.1f | Sats: %d\n", lat, lon, hdop, satellites);
    } else {
      // GSM Fallback
      // Explicitly reset variables to ensure no GPS leakage
      float gsmLat = 0, gsmLon = 0, accuracy = 0;
      int year = 0, month = 0, day = 0, time = 0;
      
      Serial.println("GPS Lost/Stale. Requesting GSM Location...");
      
      if (modem.getGsmLocation(&gsmLat, &gsmLon, &accuracy, &year, &month, &day, &time)) {
        lat = gsmLat;
        lon = gsmLon;
        source = "gsm";
        
        // Debug: Check if GSM is identical to last GPS (Suspicious)
        if (abs(lat - lastLat) < 0.00001 && abs(lon - lastLon) < 0.00001) {
             Serial.println("WARNING: GSM Location appears identical to last GPS!");
        }
        
        Serial.printf("GSM FIX: %.6f, %.6f | Accuracy: %.1fm\n", lat, lon, accuracy);
      } else {
        Serial.println("GSM Location Failed.");
      }
    }

    if (source != "none") {
      bufferData(lat, lon, speed, source, signalQuality, hdop, satellites);
    } else {
      // Heartbeat
      if (millis() - lastSend > 60000) {
         bufferData(0, 0, 0, "heartbeat", signalQuality, 99.0, 0);
         lastSend = millis();
      }
    }
    
    lastSend = millis();
    if (forceSend) flushBatch();
  }
}

void saveOffline(String data) {
  File file = SPIFFS.open("/offline.txt", FILE_APPEND);
  if(file){
    file.println(data);
    file.close();
  }
}

bool sendRawJson(String jsonString) {
  if (!client.connect(server, port)) {
    Serial.println("Server connect failed. Resetting GPRS...");
    modem.gprsDisconnect(); // Force disconnect so maintainNetwork() can reconnect
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
  
  // Verify HTTP status (treat non-2xx as send failure so offline retry works)
  bool ok = false;
  unsigned long timeout = millis();
  
  // Skip headers
  while(client.connected() && millis() - timeout < 7000) {
    if(client.available()) {
      String line = client.readStringUntil('\n');
      if(line == "\r") break; // End of headers
    }
  }
  
  // Read body
  if(client.connected()) {
    String line = client.readStringUntil('\n');
    if (line.indexOf("ok") != -1) ok = true;
    if (line.indexOf("reset") != -1) {
       Serial.println("Server requested RESET!");
       delay(1000);
       ESP.restart();
    }
    if (line.indexOf("reconnect") != -1) {
       Serial.println("Server requested RECONNECT!");
       modem.gprsDisconnect();
       // maintainNetwork() will handle reconnection
    }
  }
  
  client.stop();
  return ok;
}

bool hasFreshGpsFix() {
  if (!gps.location.isValid()) {
    // Serial.println("GPS Debug: Location Invalid"); // Uncomment for verbose debug
    return false;
  }
  
  if (gps.location.age() > GPS_MAX_AGE_MS) {
    Serial.printf("GPS Debug: Stale data (Age: %lu ms)\n", gps.location.age());
    return false;
  }

  if (gps.satellites.isValid() && gps.satellites.value() < GPS_MIN_SATS) {
    Serial.printf("GPS Debug: Low Sats (%d)\n", gps.satellites.value());
    return false;
  }

  if (gps.hdop.isValid() && gps.hdop.hdop() > GPS_MAX_HDOP) {
    Serial.printf("GPS Debug: Poor HDOP (%.1f)\n", gps.hdop.hdop());
    return false;
  }

  return true;
}

void processOfflineData() {
  if (!SPIFFS.exists("/offline.txt")) return;
  SPIFFS.rename("/offline.txt", "/processing.txt");
  
  File file = SPIFFS.open("/processing.txt", FILE_READ);
  if (!file) return;

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
    }
  }
  file.close();
  SPIFFS.remove("/processing.txt"); 
}

void bufferData(float lat, float lon, float speed, String source, int signal, float hdop, int sats) {
  JsonObject obj = batchArray.createNestedObject();
  obj["device_id"] = DEVICE_ID;
  obj["latitude"] = lat;
  obj["longitude"] = lon;
  obj["speed_kmh"] = speed;
  obj["source"] = source; 
  obj["signal"] = signal;
  obj["hdop"] = hdop;           // GPS accuracy (lower = better, <2 = excellent)
  obj["satellites"] = sats;     // Number of satellites used
  obj["battery_voltage"] = 4.0; 

  if (batchArray.size() >= BATCH_SIZE) flushBatch();
}

void flushBatch() {
  if (batchArray.size() == 0) return;

  // REMOVED BLOCKING CONNECT: if (!modem.isGprsConnected()) connectToNetwork();

  String jsonString;
  serializeJson(batchArray, jsonString);

  // Only try to send if connected. If not, save offline immediately.
  if (modem.isGprsConnected() && sendRawJson(jsonString)) {
    batchArray.clear(); 
    processOfflineData(); 
  } else {
    saveOffline(jsonString);
    batchArray.clear();
  }
}

// ============ SMS FUNCTIONS ============

void checkSMS() {
  // Check for new SMS
  String response = "";
  modem.sendAT("+CMGF=1"); // Text mode
  modem.waitResponse();
  
  // Read only unread messages to avoid huge modem buffers / delays
  modem.sendAT("+CMGL=\"REC UNREAD\"");
  if (modem.waitResponse(10000L, response) == 1) {
    response.toLowerCase();
    
    // Check if any message contains "loc"
    if (response.indexOf("loc") != -1) {
      Serial.println("SMS 'loc' command received!");
      sendLocationSMS();
      
      // Delete all SMS to free memory
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
    
    // Create Google Maps link
    message = "Papaji Tractor GPS Location:\n";
    message += "https://maps.google.com/?q=" + String(lat, 6) + "," + String(lon, 6) + "\n";
    message += "Speed: " + String(spd, 1) + " km/h\n";
    message += "Satellites: " + String(sats) + "\n";
    message += "Accuracy: ";
    if (hdopVal < 1) message += "Excellent";
    else if (hdopVal < 2) message += "Very Good";
    else if (hdopVal < 5) message += "Good";
    else message += "Poor";
    
    Serial.println("Sending GPS location via SMS...");
  } else {
    // GSM fallback for SMS if GPS is not currently fresh
    float gsmLat = 0, gsmLon = 0, accuracy = 0;
    int year = 0, month = 0, day = 0, time = 0;
    if (modem.getGsmLocation(&gsmLat, &gsmLon, &accuracy, &year, &month, &day, &time)) {
      message = "Papaji Tractor (GSM backup):\n";
      message += "https://maps.google.com/?q=" + String(gsmLat, 6) + "," + String(gsmLon, 6) + "\n";
      message += "Cell accuracy: " + String(accuracy, 0) + " m";
      Serial.println("GPS not fresh, sending GSM location via SMS...");
    } else {
      message = "Papaji Tractor:\nGPS not available and GSM location failed. Please try again later.";
      Serial.println("GPS not available and GSM fallback failed, sending error SMS...");
    }
  }
  
  // Send SMS
  modem.sendAT("+CMGF=1"); // Text mode
  modem.waitResponse();
  
  modem.sendAT("+CMGS=\"" + String(OWNER_PHONE) + "\"");
  if (modem.waitResponse(5000L, ">") == 1) {
    modem.stream.print(message);
    modem.stream.write(0x1A); // Ctrl+Z to send
    
    if (modem.waitResponse(10000L) == 1) {
      Serial.println("SMS sent successfully!");
    } else {
      Serial.println("SMS send failed!");
    }
  }
}

// ============ NEW FEATURES ============

void maintainNetwork() {
  if (modem.isGprsConnected()) {
    lastConnectionSuccess = millis();
    return;
  }

  // Hard Reset if offline for too long (5 mins)
  if (millis() - lastConnectionSuccess > HARD_RESET_INTERVAL) {
    Serial.println("Offline for 5+ mins. Force Restarting System...");
    delay(1000);
    ESP.restart();
  }

  if (millis() - lastReconnectAttempt > RECONNECT_INTERVAL) {
    lastReconnectAttempt = millis();
    Serial.println("Network disconnected. Attempting background reconnect...");
    
    // Increased timeout to 3s for better network scanning
    if (!modem.isNetworkConnected()) {
       modem.waitForNetwork(3000L);
    }
    
    if (modem.isNetworkConnected()) {
       // Try to connect GPRS
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
