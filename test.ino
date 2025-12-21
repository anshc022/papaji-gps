#include <HardwareSerial.h>
#include <TinyGPS++.h>

// ================== PIN CONFIG ==================
// SIM800L (GSM)
#define SIM800_RX 16   // ESP32 RX2
#define SIM800_TX 17   // ESP32 TX2

// NEO-6M (GPS)
#define GPS_RX 4       // ESP32 RX1
#define GPS_TX 5       // ESP32 TX1

// Phone number to reply
String PHONE_NUMBER = "+919939630600";

// ================== OBJECTS ==================
HardwareSerial sim800(2);   // UART2
HardwareSerial gpsSerial(1); // UART1
TinyGPSPlus gps;

// ================== SETUP ==================
void setup() {
  Serial.begin(115200);
  delay(1000);

  Serial.println("\n===============================");
  Serial.println(" ESP32 GPS + SIM800L TRACKER ");
  Serial.println("===============================");

  // GPS INIT
  gpsSerial.begin(9600, SERIAL_8N1, GPS_RX, GPS_TX);
  Serial.println("GPS initialized");

  // SIM800L INIT
  sim800.begin(9600, SERIAL_8N1, SIM800_RX, SIM800_TX);
  delay(2000);

  sim800.println("AT");
  delay(500);
  sim800.println("AT+CMGF=1");        // SMS text mode
  delay(500);
  sim800.println("AT+CNMI=1,2,0,0,0"); // Instant SMS
  delay(500);

  Serial.println("SYSTEM READY");
  Serial.println("➡ Take device OUTSIDE");
  Serial.println("➡ Wait for GPS fix (2–10 min)");
  Serial.println("➡ Send SMS: LOC");
}

// ================== LOOP ==================
void loop() {

  // ---- Read GPS continuously ----
  while (gpsSerial.available()) {
    gps.encode(gpsSerial.read());
  }

  // ---- GPS Debug every 3 seconds ----
  static unsigned long lastDebug = 0;
  if (millis() - lastDebug > 3000) {
    lastDebug = millis();
    Serial.print("Satellites: ");
    Serial.print(gps.satellites.value());
    Serial.print(" | GPS Fix: ");
    Serial.println(gps.location.isValid() ? "YES" : "NO");
  }

  // ---- Read incoming SMS ----
  if (sim800.available()) {
    String sms = sim800.readString();
    sms.toUpperCase();

    Serial.println("\n--- SMS RECEIVED ---");
    Serial.println(sms);

    if (sms.indexOf("LOC") != -1) {
      sendLocationSMS();
    }
  }
}

// ================== SEND LOCATION ==================
void sendLocationSMS() {

  String msg = "ESP32 GPS TRACKER\n";

  if (gps.location.isValid()) {
    float lat = gps.location.lat();
    float lon = gps.location.lng();

    msg += "GPS FIX OK\n";
    msg += "Lat: " + String(lat, 6) + "\n";
    msg += "Lng: " + String(lon, 6) + "\n";
    msg += "Map:\nhttps://maps.google.com/?q=";
    msg += String(lat, 6) + "," + String(lon, 6);

  } else {
    msg += "NO GPS FIX YET\n";
    msg += "Satellites: ";
    msg += String(gps.satellites.value());
    msg += "\nGo outside & wait";
  }

  Serial.println("\nSending SMS:");
  Serial.println(msg);

  sim800.println("AT+CMGS=\"" + PHONE_NUMBER + "\"");
  delay(500);
  sim800.print(msg);
  delay(500);
  sim800.write(26); // CTRL+Z

  Serial.println("SMS SENT");
}
