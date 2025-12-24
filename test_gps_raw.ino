/*
 * GPS RAW PASS-THROUGH TEST
 * This code simply reads whatever is coming from the GPS pins
 * and prints it to the Serial Monitor.
 * 
 * IF YOU SEE:
 * - "$GPGGA,..." -> GPS is WORKING!
 * - "" -> GPS is working but Baud Rate is wrong.
 * - NOTHING -> Check Wiring (TX/RX) or Power.
 */

#include <HardwareSerial.h>

// Try these pins first:
#define GPS_RX 4 
#define GPS_TX 5 

HardwareSerial gpsSerial(1); 

void setup() {
  Serial.begin(115200);
  delay(1000);
  Serial.println("\n--- GPS RAW DATA TEST ---");
  Serial.println("Reading from RX=4, TX=5...");
  
  // Most NEO-6M modules use 9600 baud
  gpsSerial.begin(9600, SERIAL_8N1, GPS_RX, GPS_TX);
}

void loop() {
  if (gpsSerial.available()) {
    char c = gpsSerial.read();
    Serial.write(c); // Print exactly what we receive
  }
}
