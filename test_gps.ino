/*
 * GPS Debug Firmware for Papaji GPS
 * Board: ESP32 Dev Module
 * Module: NEO-6M GPS
 * Pins: RX=4, TX=5
 */

#include <TinyGPS++.h>
#include <HardwareSerial.h>

// --- PINS (SWAPPED FOR TESTING) ---
#define GPS_RX 5 
#define GPS_TX 4 

TinyGPSPlus gps;
HardwareSerial gpsSerial(1); 

void setup() {
  Serial.begin(115200);
  delay(1000);
  Serial.println("\n--- GPS DEBUG START (PINS SWAPPED) ---");
  Serial.println("Initializing GPS Serial (RX=5, TX=4)...");
  
  // Initialize GPS Serial
  gpsSerial.begin(9600, SERIAL_8N1, GPS_RX, GPS_TX);
  
  Serial.println("Waiting for GPS data...");
  Serial.println("Make sure you are OUTDOORS for a satellite fix.");
  Serial.println("------------------------------------------------");
}

void loop() {
  // 1. Read Raw Data
  while (gpsSerial.available() > 0) {
    char c = gpsSerial.read();
    // Uncomment the line below to see RAW NMEA data (messy but proves connection)
    // Serial.write(c); 
    
    gps.encode(c);
  }

  // 2. Check for Fix every 1 second
  static unsigned long lastCheck = 0;
  if (millis() - lastCheck > 1000) {
    lastCheck = millis();
    
    Serial.print("Sats: ");
    Serial.print(gps.satellites.value());
    Serial.print(" | HDOP: ");
    Serial.print(gps.hdop.hdop());
    
    if (gps.location.isValid()) {
      Serial.print(" | Lat: ");
      Serial.print(gps.location.lat(), 6);
      Serial.print(" | Lon: ");
      Serial.print(gps.location.lng(), 6);
      Serial.print(" | Speed: ");
      Serial.print(gps.speed.kmph());
      Serial.println(" km/h");
    } else {
      Serial.println(" | Searching for Satellites... (Go Outside)");
    }

    // 3. Connection Check
    if (gps.charsProcessed() < 10 && millis() > 5000) {
      Serial.println("\n!!! WARNING: No GPS Data Received !!!");
      Serial.println("TRY SWAPPING YOUR WIRES PHYSICALLY:");
      Serial.println("Connect GPS TX -> ESP32 Pin 5");
      Serial.println("Connect GPS RX -> ESP32 Pin 4");
    }
  }
}
