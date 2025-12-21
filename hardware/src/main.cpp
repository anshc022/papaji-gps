/*
 * Papaji GPS Tracker Firmware - MQTT Version
 * Board: ESP32 Dev Module
 * Modules: NEO-6M GPS, SIM800L GSM
 * 
 * Uses MQTT for reliable communication (no HTTPS needed!)
 */

#include <Arduino.h>
#define TINY_GSM_MODEM_SIM800
#include <TinyGsmClient.h>
#include <TinyGPS++.h>
#include <ArduinoJson.h>
#include <HardwareSerial.h>
#include <esp_task_wdt.h>
#include <PubSubClient.h>
#include <FS.h>
#include <SPIFFS.h>

// --- CONFIGURATION ---
const char apn[]      = "airtelgprs.com"; 
const char gprsUser[] = "";
const char gprsPass[] = "";

// MQTT Broker (Free Public Broker - No Auth Required)
const char* mqtt_server = "broker.hivemq.com";
const int mqtt_port = 1883;
const char* mqtt_topic = "papaji/gps/telemetry";
const char* mqtt_client_id = "papaji_tractor_01";

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
TinyGsmClient gsmClient(modem);
PubSubClient mqtt(gsmClient);

unsigned long lastSend = 0;
unsigned long currentInterval = 5000;

// Smart Cornering
double lastHeading = 0;
const double CORNER_THRESHOLD = 30.0;

// Forward Declarations
void connectToNetwork();
void connectMQTT();
void sendGPSData(float lat, float lon, float speed, String source, int signal);

void setup() {
  Serial.begin(115200);
  Serial.println("\n=== Papaji GPS Tracker (MQTT Mode) ===");

  // Init SPIFFS
  if(!SPIFFS.begin(true)){
    Serial.println("SPIFFS Mount Failed");
  } else {
    Serial.println("SPIFFS Mounted");
  }

  // Watchdog
  esp_task_wdt_init(WDT_TIMEOUT, true);
  esp_task_wdt_add(NULL);

  // Start Serials
  gpsSerial.begin(9600, SERIAL_8N1, GPS_RX, GPS_TX);
  gsmSerial.begin(9600, SERIAL_8N1, GSM_RX, GSM_TX);

  // Initialize Modem
  Serial.println("Initializing modem...");
  modem.restart();
  
  // Connect to GPRS
  connectToNetwork();

  // Setup MQTT
  mqtt.setServer(mqtt_server, mqtt_port);
  mqtt.setBufferSize(512); // Increase buffer for JSON
  
  // Connect to MQTT
  connectMQTT();

  Serial.println("Setup complete. Starting main loop...");
}

void connectToNetwork() {
  Serial.print("Connecting to APN: ");
  Serial.print(apn);
  if (!modem.gprsConnect(apn, gprsUser, gprsPass)) {
    Serial.println(" fail. Restarting...");
    delay(5000);
    ESP.restart();
  }
  Serial.println(" success");
  
  // Print IP
  Serial.print("Device IP: ");
  Serial.println(modem.getLocalIP());
}

void connectMQTT() {
  Serial.print("Connecting to MQTT broker...");
  
  int attempts = 0;
  while (!mqtt.connected() && attempts < 5) {
    if (mqtt.connect(mqtt_client_id)) {
      Serial.println(" connected!");
      // Publish a hello message
      mqtt.publish("papaji/gps/status", "online");
    } else {
      Serial.print(" failed (");
      Serial.print(mqtt.state());
      Serial.println("). Retrying in 3s...");
      delay(3000);
      attempts++;
    }
  }
  
  if (!mqtt.connected()) {
    Serial.println("MQTT connection failed after 5 attempts.");
  }
}

void loop() {
  esp_task_wdt_reset();

  // Keep MQTT alive
  if (!mqtt.connected()) {
    connectMQTT();
  }
  mqtt.loop();

  // Read GPS
  while (gpsSerial.available() > 0) {
    gps.encode(gpsSerial.read());
  }

  // Dynamic Interval
  if (gps.speed.kmph() < 2.0) {
    currentInterval = 300000; // 5 min if parked
  } else {
    currentInterval = 5000; // 5 sec if moving
  }

  // Cornering Detection
  bool forceSend = false;
  if (gps.location.isValid() && gps.speed.kmph() > 5.0) {
    double currentHeading = gps.course.deg();
    double diff = abs(currentHeading - lastHeading);
    if (diff > 180) diff = 360 - diff;
    
    if (diff > CORNER_THRESHOLD) {
      forceSend = true;
      Serial.println("Corner detected!");
    }
  }

  // Send Data
  if (millis() - lastSend > currentInterval || forceSend) {
    float lat = 0, lon = 0, speed = 0;
    String source = "none";
    int signalQuality = modem.getSignalQuality();

    if (gps.location.isValid()) {
      lat = gps.location.lat();
      lon = gps.location.lng();
      speed = gps.speed.kmph();
      if (speed < 1.0) speed = 0;
      source = "gps";
      lastHeading = gps.course.deg();
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
      sendGPSData(lat, lon, speed, source, signalQuality);
    } else {
      Serial.println("No location fix.");
    }

    lastSend = millis();
  }
}

void sendGPSData(float lat, float lon, float speed, String source, int signal) {
  if (!mqtt.connected()) {
    Serial.println("MQTT not connected. Skipping send.");
    return;
  }

  // Create JSON
  StaticJsonDocument<256> doc;
  doc["device_id"] = DEVICE_ID;
  doc["latitude"] = lat;
  doc["longitude"] = lon;
  doc["speed_kmh"] = speed;
  doc["source"] = source;
  doc["signal"] = signal;
  doc["battery"] = 4.0;
  doc["timestamp"] = millis();

  char jsonBuffer[256];
  serializeJson(doc, jsonBuffer);

  Serial.print("Publishing: ");
  Serial.println(jsonBuffer);

  if (mqtt.publish(mqtt_topic, jsonBuffer)) {
    Serial.println("✓ Sent via MQTT!");
  } else {
    Serial.println("✗ MQTT publish failed");
  }
}
