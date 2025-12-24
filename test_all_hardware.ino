/*
 * FULL HARDWARE DEBUG FIRMWARE
 * Tests BOTH GPS (NEO-6M) and GSM (SIM800L) simultaneously.
 * 
 * WIRING:
 * GPS TX -> ESP32 Pin 4
 * GPS RX -> ESP32 Pin 5
 * GSM TX -> ESP32 Pin 16
 * GSM RX -> ESP32 Pin 17
 */

#define TINY_GSM_MODEM_SIM800
#include <TinyGsmClient.h>
#include <TinyGPS++.h>
#include <HardwareSerial.h>

// --- PINS ---
#define GPS_RX 4 
#define GPS_TX 5 
#define GSM_RX 16 
#define GSM_TX 17 

// --- OBJECTS ---
TinyGPSPlus gps;
HardwareSerial gpsSerial(1); 
HardwareSerial gsmSerial(2); 
TinyGsm modem(gsmSerial);

void setup() {
  Serial.begin(115200);
  delay(1000);
  Serial.println("\n=========================================");
  Serial.println("   PAPAJI GPS - HARDWARE DIAGNOSTIC");
  Serial.println("=========================================\n");

  // 1. TEST GSM
  Serial.println("--- STEP 1: TESTING GSM (SIM800L) ---");
  gsmSerial.begin(9600, SERIAL_8N1, GSM_RX, GSM_TX);
  delay(1000);
  
  Serial.print("Connecting to GSM...");
  modem.restart();
  
  String modemInfo = modem.getModemInfo();
  if (modemInfo != "") {
    Serial.println(" SUCCESS!");
    Serial.print("Modem: "); Serial.println(modemInfo);
    Serial.print("Signal: "); Serial.print(modem.getSignalQuality()); Serial.println("%");
    
    Serial.print("Network: ");
    if (modem.waitForNetwork(5000L)) Serial.println("Connected");
    else Serial.println("Searching...");
  } else {
    Serial.println(" FAILED!");
    Serial.println("Check GSM Wiring (RX=16, TX=17) & Power (3.7V-4.2V)");
  }
  Serial.println();

  // 2. TEST GPS
  Serial.println("--- STEP 2: TESTING GPS (NEO-6M) ---");
  gpsSerial.begin(9600, SERIAL_8N1, GPS_RX, GPS_TX);
  Serial.println("Listening on RX=4, TX=5...");
  Serial.println("Go OUTSIDE for satellite lock.");
  Serial.println("-----------------------------------------");
}

void loop() {
  // Read GPS Data
  while (gpsSerial.available() > 0) {
    gps.encode(gpsSerial.read());
  }

  // Print GPS Status every 2 seconds
  static unsigned long lastLog = 0;
  if (millis() - lastLog > 2000) {
    lastLog = millis();
    
    Serial.print("[GPS STATUS] ");
    if (gps.charsProcessed() < 10) {
      Serial.println("NO DATA! Check Wiring (TX->4, RX->5)");
    } else {
      Serial.print("Sats: "); Serial.print(gps.satellites.value());
      Serial.print(" | HDOP: "); Serial.print(gps.hdop.hdop());
      
      if (gps.location.isValid()) {
        Serial.print(" | LOC: "); 
        Serial.print(gps.location.lat(), 6);
        Serial.print(", ");
        Serial.print(gps.location.lng(), 6);
      } else {
        Serial.print(" | Searching...");
      }
      Serial.println();
    }
  }

  // GSM Passthrough (Type AT commands in Serial Monitor)
  if (Serial.available()) {
    gsmSerial.write(Serial.read());
  }
  if (gsmSerial.available()) {
    Serial.write(gsmSerial.read());
  }
}
