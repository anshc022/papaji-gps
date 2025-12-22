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
void bufferData(float lat, float lon, float speed, String source, int signal, float hdop, int sats);
void flushBatch();
bool sendRawJson(String jsonString);
void saveOffline(String data);
void processOfflineData();

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
  }
}

void loop() {
  esp_task_wdt_reset();

  while (gpsSerial.available() > 0) {
    gps.encode(gpsSerial.read());
  }

  // Smart Interval
  currentInterval = (gps.speed.kmph() < 2.0) ? 10000 : 5000;

  // Smart Cornering
  bool forceSend = false;
  if (gps.location.isValid() && gps.speed.kmph() > 5.0) {
      double currentHeading = gps.course.deg();
      double diff = abs(currentHeading - lastHeading);
      if (diff > 180) diff = 360 - diff;
      
      if (diff > CORNER_THRESHOLD) {
          forceSend = true;
          Serial.println("Corner!");
      }
  }

  if (millis() - lastSend > currentInterval || forceSend) {
    if (!modem.isGprsConnected()) connectToNetwork();

    float lat = 0, lon = 0, speed = 0;
    float hdop = 99.0;  // GPS accuracy (99 = no fix)
    int satellites = 0;
    String source = "none";
    int signalQuality = modem.getSignalQuality();

    if (gps.location.isValid()) {
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
      
      Serial.printf("GPS: %.6f, %.6f | HDOP: %.1f | Sats: %d\n", lat, lon, hdop, satellites);
    } else {
      // GSM Fallback
      float gsmLat = 0, gsmLon = 0, accuracy = 0;
      int year = 0, month = 0, day = 0, time = 0;
      if (modem.getGsmLocation(&gsmLat, &gsmLon, &accuracy, &year, &month, &day, &time)) {
        lat = gsmLat;
        lon = gsmLon;
        source = "gsm";
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
  if (!client.connect(server, port)) return false;
  
  client.print(String("POST ") + resource + " HTTP/1.1\r\n");
  client.print(String("Host: ") + server + "\r\n");
  client.println("Connection: close");
  client.println("Content-Type: application/json");
  client.print("Content-Length: ");
  client.println(jsonString.length());
  client.println();
  client.println(jsonString);
  
  unsigned long timeout = millis();
  while (client.connected() && millis() - timeout < 5000) {
    if (client.available()) {
      client.readStringUntil('\n'); // Read headers
      break;
    }
  }
  client.stop();
  return true;
}

void processOfflineData() {
  if (!SPIFFS.exists("/offline.txt")) return;
  SPIFFS.rename("/offline.txt", "/processing.txt");
  
  File file = SPIFFS.open("/processing.txt", FILE_READ);
  if (!file) return;

  bool errorOccurred = false;
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
        errorOccurred = true;
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

  if (!modem.isGprsConnected()) connectToNetwork();

  String jsonString;
  serializeJson(batchArray, jsonString);

  if (sendRawJson(jsonString)) {
    batchArray.clear(); 
    processOfflineData(); 
  } else {
    saveOffline(jsonString);
    batchArray.clear();
  }
}
