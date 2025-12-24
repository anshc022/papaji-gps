/*
 * GSM Debug Firmware for Papaji GPS
 * Board: ESP32 Dev Module
 * Module: SIM800L
 * Pins: RX=16, TX=17
 */

#define TINY_GSM_MODEM_SIM800
#include <TinyGsmClient.h>
#include <HardwareSerial.h>

// --- CONFIGURATION ---
const char apn[]      = "airtelgprs.com"; 
const char gprsUser[] = "";
const char gprsPass[] = "";

// --- PINS ---
#define GSM_RX 16 
#define GSM_TX 17 

HardwareSerial gsmSerial(2); 
TinyGsm modem(gsmSerial);

void setup() {
  // Debug Serial
  Serial.begin(115200);
  delay(1000);
  Serial.println("\n--- GSM DEBUG START ---");

  // GSM Serial
  Serial.println("Initializing GSM Serial (RX=16, TX=17)...");
  gsmSerial.begin(9600, SERIAL_8N1, GSM_RX, GSM_TX);
  delay(3000);

  // --- CONNECTION CHECK ---
  Serial.println("Testing connection to GSM module...");
  modem.stream.print("AT\r\n"); // Send manual AT
  String res = modem.stream.readStringUntil('\n'); // Read garbage/echo
  res = modem.stream.readStringUntil('\n'); // Read response
  
  if (modem.testAT()) {
      Serial.println("\n************************************************");
      Serial.println(" SUCCESS: ESP32 IS CONNECTED TO GSM MODULE! ");
      Serial.println("************************************************\n");
  } else {
      Serial.println("\n************************************************");
      Serial.println(" ERROR: ESP32 CANNOT TALK TO GSM MODULE ");
      Serial.println(" Check: ");
      Serial.println(" 1. Wiring (TX->16, RX->17) ");
      Serial.println(" 2. Power (GSM needs 3.7V-4.2V, Common GND) ");
      Serial.println("************************************************\n");
  }

  // Restart Modem
  Serial.println("Restarting Modem...");
  modem.restart();
  
  // Modem Info
  String modemInfo = modem.getModemInfo();
  Serial.print("Modem Info: ");
  Serial.println(modemInfo);

  // Signal Quality
  int signal = modem.getSignalQuality();
  Serial.print("Signal Quality (0-31): ");
  Serial.println(signal);

  // Network Registration
  Serial.print("Waiting for network...");
  if (!modem.waitForNetwork(60000L)) {
    Serial.println(" FAIL");
    Serial.println("Check SIM card, Antenna, and Power Supply.");
    return;
  }
  Serial.println(" OK");

  if (modem.isNetworkConnected()) {
    Serial.println("Network Connected.");
  }

  // GPRS Connection
  Serial.print("Connecting to APN: ");
  Serial.print(apn);
  if (!modem.gprsConnect(apn, gprsUser, gprsPass)) {
    Serial.println(" FAIL");
  } else {
    Serial.println(" OK");
    if (modem.isGprsConnected()) {
      Serial.println("GPRS Connected!");
      Serial.print("IP Address: ");
      Serial.println(modem.localIP());
    }
  }
  
  Serial.println("\n--- DEBUG COMPLETE ---");
  Serial.println("You can now type AT commands in the Serial Monitor.");
}

void loop() {
  // Pass through Serial data for manual AT commands
  if (gsmSerial.available()) {
    Serial.write(gsmSerial.read());
  }
  if (Serial.available()) {
    gsmSerial.write(Serial.read());
  }
}
