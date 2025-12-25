/*
 * GPS DIAGNOSTIC TOOL
 * Use this to check if your GPS module is alive.
 * 
 * INSTRUCTIONS:
 * 1. Upload this code.
 * 2. Open Serial Monitor (115200 baud).
 * 3. Look for lines starting with $GPRMC, $GPGGA, etc.
 */

#include <HardwareSerial.h>
#include <TinyGPS++.h>

// PINS (Matches your main code)
#define GPS_RX 4
#define GPS_TX 5
#define LED_PIN 2

HardwareSerial gpsSerial(1);
TinyGPSPlus gps;

void setup() {
  Serial.begin(115200);
  gpsSerial.begin(9600, SERIAL_8N1, GPS_RX, GPS_TX);
  pinMode(LED_PIN, OUTPUT);

  Serial.println("\n=============================================");
  Serial.println("   GPS HARDWARE TEST");
  Serial.println("=============================================");
  Serial.println("Waiting for data from GPS module...");
  Serial.println("If you see weird text like $GPRMC, it is WORKING.");
  Serial.println("If you see NOTHING, check RX/TX wires.");
  Serial.println("=============================================\n");
}

void loop() {
  bool receivedData = false;

  // Read raw data from GPS
  while (gpsSerial.available() > 0) {
    char c = gpsSerial.read();
    Serial.write(c); // Print raw character to Serial Monitor
    gps.encode(c);
    receivedData = true;
  }

  // Flash LED when data arrives
  if (receivedData) {
    digitalWrite(LED_PIN, HIGH);
    delay(5);
    digitalWrite(LED_PIN, LOW);
  }

  // Print status summary every 2 seconds
  static unsigned long lastStats = 0;
  if (millis() - lastStats > 2000) {
    lastStats = millis();
    
    if (gps.charsProcessed() > 10) {
      Serial.println("\n\n--- STATUS REPORT ---");
      Serial.print("Satellites: "); Serial.println(gps.satellites.value());
      Serial.print("HDOP:       "); Serial.println(gps.hdop.hdop());
      
      if (gps.location.isValid()) {
        Serial.print("Location:   "); 
        Serial.print(gps.location.lat(), 6);
        Serial.print(", ");
        Serial.println(gps.location.lng(), 6);
        Serial.println("✅ GPS LOCKED!");
      } else {
        Serial.println("❌ NO FIX YET (Go outside)");
      }
      Serial.println("---------------------\n");
    } else {
      Serial.println("\n[!] NO DATA RECEIVED YET. Check wiring (RX/TX)!");
    }
  }
}
