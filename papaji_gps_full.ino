/*
 * Papaji GPS Tracker Firmware - Full Version
 * Board: ESP32 Dev Module
 * Modules: NEO-6M GPS, SIM800L GSM
 * 
 * Instructions:
 * 1. Open this file in Arduino IDE.
 * 2. Install Libraries via Library Manager:
 *    - TinyGSM (by Volodymyr Shymanskyy)
 *    - TinyGPSPlus (by Mikal Hart)
 *    - ArduinoJson (by Benoit Blanchon)
 * 3. Select Board: "DOIT ESP32 DEVKIT V1"
 * 4. Upload!
 */

#define TINY_GSM_MODEM_SIM800
#include <TinyGsmClient.h>
#include <TinyGPS++.h>
#include <ArduinoJson.h>
#include <HardwareSerial.h>
#include <esp_task_wdt.h> // Watchdog Library
#include <esp_arduino_version.h> // Version check
#include <FS.h> // Filesystem
#include <SPIFFS.h> // SPI Flash File System

// --- CONFIGURATION ---
const char apn[]      = "airtelgprs.com"; 
const char gprsUser[] = "";
const char gprsPass[] = "";

// Backend Server Details
const char server[]   = "3.27.84.253"; 
const int  port       = 3000;
const char resource[] = "/api/telemetry";

const String DEVICE_ID = "papaji_tractor_01";
const int WDT_TIMEOUT = 120; // Restart if stuck for 120 seconds

// --- PINS ---
// GSM (SIM800L) - Uses UART2
#define GSM_RX 16 
#define GSM_TX 17 

// GPS (NEO-6M) - Uses UART1
#define GPS_RX 4 
#define GPS_TX 5 

// --- OBJECTS ---
TinyGPSPlus gps;
HardwareSerial gpsSerial(1); // UART1 for GPS
HardwareSerial gsmSerial(2); // UART2 for GSM 

TinyGsm modem(gsmSerial);
TinyGsmClient client(modem);

unsigned long lastSend = 0;
unsigned long currentInterval = 5000; // Dynamic Interval

// Smart Cornering Variables
double lastHeading = 0;
const double CORNER_THRESHOLD = 30.0; // Degrees turn to trigger update

// Batching Variables
const int BATCH_SIZE = 2; // Send every 2 points (fast testing)
DynamicJsonDocument batchDoc(8192);
JsonArray batchArray = batchDoc.to<JsonArray>();

// Forward Declarations
void connectToNetwork();
void checkConnection();
void bufferData(float lat, float lon, float speed, String source, int signal);
void flushBatch();
bool sendRawJson(String jsonString);
void saveOffline(String data);
void processOfflineData();

void testInternet() {
  Serial.println("Testing Internet Connectivity...");
  
  // 1. Check Signal Quality (0-31)
  int csq = modem.getSignalQuality();
  Serial.print("Signal Quality: "); Serial.print(csq); Serial.println(" (Min required: 10)");

  // 2. Check IP Address
  String localIP = modem.getLocalIP();
  Serial.print("Device IP: "); Serial.println(localIP);

  if (localIP == "0.0.0.0") {
      Serial.println("ERR: No IP Address! APN might be wrong.");
      return;
  }

  // 3. Test Connection
  TinyGsmClient testClient(modem);
  if (testClient.connect("www.google.com", 80)) {
    Serial.println("Internet OK (Connected to google.com)");
    testClient.stop();
  } else {
    Serial.println("Internet Failed! Check APN/SIM.");
  }
}



void setup() {
  // 1. Debug Serial
  Serial.begin(115200);
  Serial.println("\nStarting Papaji GPS Tracker (Pro Mode)...");

  // 2. Init SPIFFS (Offline Storage)
  if(!SPIFFS.begin(true)){
    Serial.println("SPIFFS Mount Failed");
  } else {
    Serial.println("SPIFFS Mounted");
  }

  // 3. Enable Watchdog (Auto-restart if frozen)
  #if ESP_ARDUINO_VERSION >= ESP_ARDUINO_VERSION_VAL(3, 0, 0)
    esp_task_wdt_deinit(); // Fix: Disable default WDT first
    esp_task_wdt_config_t wdt_config = {
      .timeout_ms = WDT_TIMEOUT * 1000,
      .trigger_panic = true
    };
    esp_task_wdt_init(&wdt_config);
  #else
    esp_task_wdt_init(WDT_TIMEOUT, true);
  #endif
  
  esp_task_wdt_add(NULL);

  // 4. Start Serials
  gpsSerial.begin(9600, SERIAL_8N1, GPS_RX, GPS_TX);
  gsmSerial.begin(9600, SERIAL_8N1, GSM_RX, GSM_TX);

  // 4. Initialize Modem
  Serial.println("Initializing modem...");
  esp_task_wdt_reset(); // Reset WDT before long operation
  modem.restart();
  
  // 5. Connect to GPRS
  connectToNetwork();

  testInternet();
  
  Serial.println("Waiting 3s before server connection...");
  delay(3000); 

  Serial.println("Starting main loop...");
}

void connectToNetwork() {
  Serial.print("Connecting to APN: ");
  Serial.print(apn);
  if (!modem.gprsConnect(apn, gprsUser, gprsPass)) {
    Serial.println(" fail. Retrying in 5s...");
    delay(5000);
    ESP.restart(); // Brute force fix: Restart if modem fails at boot
  }
  Serial.println(" success");
}

void loop() {
  // Reset Watchdog Timer (Feed the dog)
  esp_task_wdt_reset();

  // 1. Read GPS Data
  while (gpsSerial.available() > 0) {
    gps.encode(gpsSerial.read());
  }

  // 2. Smart Interval Logic
  // TEST MODE: Send every 10 seconds even if parked
  if (gps.speed.kmph() < 2.0) {
    currentInterval = 10000; // 10 Seconds (was 5 mins)
  } else {
    currentInterval = 5000; // 5 Seconds
  }

  // 2.5 Smart Cornering Logic
  bool forceSend = false;
  if (gps.location.isValid() && gps.speed.kmph() > 5.0) {
      double currentHeading = gps.course.deg();
      double diff = abs(currentHeading - lastHeading);
      if (diff > 180) diff = 360 - diff; // Handle 359->1 transition
      
      if (diff > CORNER_THRESHOLD) {
          forceSend = true;
          Serial.println("Corner detected! Force sending.");
      }
  }

  // 3. Send Data
  if (millis() - lastSend > currentInterval || forceSend) {
    checkConnection(); // Ensure we are online before trying

    float lat = 0, lon = 0, speed = 0;
    String source = "none";
    int signalQuality = 0;

    // Get Signal Strength (0-31)
    signalQuality = modem.getSignalQuality();

    if (gps.location.isValid()) {
      speed = gps.speed.kmph();
      
      // --- OPTIMIZATION: GPS DRIFT FILTER ---
      // If moving very slowly (< 1 km/h), ignore small position changes
      // This prevents "wiggling" when parked adding fake distance
      if (speed < 1.0) {
         speed = 0; // Force zero speed
         // Keep previous lat/lon (don't update) unless we don't have one yet
         if (lastHeading == 0) { 
            lat = gps.location.lat();
            lon = gps.location.lng();
         } else {
            // Use the last known good position (simulated here by not updating variables if we had global ones)
            // For simplicity in this loop, we just send the current one but mark speed 0
            lat = gps.location.lat();
            lon = gps.location.lng();
         }
      } else {
         lat = gps.location.lat();
         lon = gps.location.lng();
      }
      
      source = "gps";
      lastHeading = gps.course.deg(); 
    } else {
      // Fallback to GSM
      float gsmLat = 0, gsmLon = 0, accuracy = 0;
      int year = 0, month = 0, day = 0, time = 0;
      if (modem.getGsmLocation(&gsmLat, &gsmLon, &accuracy, &year, &month, &day, &time)) {
        lat = gsmLat;
        lon = gsmLon;
        source = "gsm";
      }
    }

    if (source != "none") {
      bufferData(lat, lon, speed, source, signalQuality);
    } else {
      Serial.println("No location fix.");
    }
    
    lastSend = millis();
    
    // Flush immediately if forced (Cornering)
    if (forceSend) {
       flushBatch();
    }
  }
}

void checkConnection() {
  if (!modem.isGprsConnected()) {
    Serial.println("Network lost! Reconnecting...");
    modem.gprsConnect(apn, gprsUser, gprsPass);
  }
}

// --- OFFLINE STORAGE FUNCTIONS ---

void saveOffline(String data) {
  File file = SPIFFS.open("/offline.txt", FILE_APPEND);
  if(!file){
    Serial.println("Failed to open file for appending");
    return;
  }
  file.println(data);
  file.close();
  Serial.println("Data saved offline.");
}

bool sendRawJson(String jsonString) {
  if (!client.connect(server, port)) {
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
  
  // Read Response for Remote Config
  unsigned long timeout = millis();
  while (client.connected() && millis() - timeout < 5000) {
    if (client.available()) {
      String line = client.readStringUntil('\n');
      if (line == "\r") {
        // Headers ended, read body
        String body = client.readString();
        body.trim();
        
        // Parse JSON Response
        StaticJsonDocument<200> responseDoc;
        DeserializationError error = deserializeJson(responseDoc, body);
        
        if (!error) {
          if (responseDoc.containsKey("interval")) {
            long newInterval = responseDoc["interval"];
            if (newInterval >= 1000 && newInterval <= 3600000) {
               currentInterval = newInterval;
               Serial.println("Remote Config: Interval updated to " + String(newInterval));
            }
          }
          if (responseDoc.containsKey("restart") && responseDoc["restart"] == true) {
             Serial.println("Remote Config: Restarting...");
             ESP.restart();
          }
        }
        break;
      }
    }
  }
  client.stop();
  return true;
}

void processOfflineData() {
  if (!SPIFFS.exists("/offline.txt")) return;

  // Rename to processing to prevent conflicts
  SPIFFS.rename("/offline.txt", "/processing.txt");
  
  File file = SPIFFS.open("/processing.txt", FILE_READ);
  if (!file) return;

  Serial.println("Syncing offline data...");
  bool errorOccurred = false;
  
  while (file.available()) {
    String line = file.readStringUntil('\n');
    line.trim();
    if (line.length() > 0) {
      if (sendRawJson(line)) {
        Serial.print("."); // Success
      } else {
        // Upload failed! Stop and save everything back.
        Serial.println("\nSync failed. Saving remaining data...");
        
        File backup = SPIFFS.open("/offline.txt", FILE_APPEND);
        if (backup) {
            backup.println(line); // Save the line that failed
            while(file.available()) {
                backup.println(file.readStringUntil('\n')); // Save the rest
            }
            backup.close();
        }
        errorOccurred = true;
        break; 
      }
    }
  }
  file.close();
  
  // Only delete the processing file. 
  // If errorOccurred is true, we already moved the rest back to offline.txt.
  // If errorOccurred is false, we sent everything, so we are clean.
  SPIFFS.remove("/processing.txt"); 
  
  if (!errorOccurred) {
    Serial.println("\nSync complete. Memory cleaned.");
  }
}

void bufferData(float lat, float lon, float speed, String source, int signal) {
  Serial.println("Buffering data...");

  // Add to Batch
  JsonObject obj = batchArray.createNestedObject();
  obj["device_id"] = DEVICE_ID;
  obj["latitude"] = lat;
  obj["longitude"] = lon;
  obj["speed_kmh"] = speed;
  obj["source"] = source; 
  obj["signal"] = signal;
  
  // Read Battery Voltage (Optional: Add Voltage Divider on Pin 34)
  // For now, we assume a healthy Li-ion battery (approx 4.0V)
  // To make this real: float voltage = (analogRead(34) / 4095.0) * 7.2; 
  obj["battery_voltage"] = 4.0; 

  obj["timestamp"] = gps.time.value(); // Optional: Add timestamp if needed

  Serial.print("Batch Size: "); Serial.println(batchArray.size());

  if (batchArray.size() >= BATCH_SIZE) {
    flushBatch();
  }
}

void flushBatch() {
  if (batchArray.size() == 0) return;

  Serial.println("Flushing batch to server...");
  checkConnection();

  String jsonString;
  serializeJson(batchArray, jsonString);

  if (sendRawJson(jsonString)) {
    Serial.println("Batch sent!");
    batchArray.clear(); // Clear buffer
    processOfflineData(); 
  } else {
    Serial.println("Connection failed. Saving batch offline.");
    // Save the whole batch array as one line (or iterate)
    // For simplicity, we save the raw array string
    saveOffline(jsonString);
    batchArray.clear();
  }
}
