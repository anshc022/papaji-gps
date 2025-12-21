/*
 * AWS Connection Test Sketch
 * Board: ESP32 Dev Module
 * Modules: SIM800L GSM
 * 
 * Instructions:
 * 1. Open this file in Arduino IDE.
 * 2. Install "TinyGSM" library by Volodymyr Shymanskyy via Library Manager.
 * 3. Select Board: "DOIT ESP32 DEVKIT V1" or similar.
 * 4. Upload and open Serial Monitor (115200 baud).
 */

#define TINY_GSM_MODEM_SIM800
#include <TinyGsmClient.h>
#include <HardwareSerial.h>

// --- CONFIGURATION ---
const char apn[]      = "airtelgprs.com"; 
const char gprsUser[] = "";
const char gprsPass[] = "";

// AWS Server Details
const char server[]   = "3.27.84.253"; 
const int  port       = 3000;
const char resource[] = "/api/telemetry";

// --- PINS ---
#define GSM_RX 16 
#define GSM_TX 17 

// --- OBJECTS ---
HardwareSerial gsmSerial(2); // UART2 for GSM 
TinyGsm modem(gsmSerial);
TinyGsmClient client(modem);

void setup() {
  // 1. Debug Serial
  Serial.begin(115200);
  delay(1000);
  Serial.println("\n\n--- AWS CONNECTION TEST START ---");

  // 2. GSM Serial
  gsmSerial.begin(9600, SERIAL_8N1, GSM_RX, GSM_TX);
  delay(3000);

  // 3. Initialize Modem
  Serial.println("Initializing modem...");
  modem.restart();
  String modemInfo = modem.getModemInfo();
  Serial.print("Modem Info: ");
  Serial.println(modemInfo);

  // 4. Connect to Network
  Serial.print("Connecting to APN: ");
  Serial.print(apn);
  if (!modem.gprsConnect(apn, gprsUser, gprsPass)) {
    Serial.println(" -> FAIL");
    Serial.println("Check SIM card, Antenna, or Power Supply.");
    while (true);
  }
  Serial.println(" -> SUCCESS");

  if (modem.isGprsConnected()) {
    Serial.println("GPRS Connected!");
    Serial.print("IP Address: ");
    Serial.println(modem.localIP());
  }

  // 5. Send Test Data to AWS
  sendTestData();
}

void loop() {
  // Do nothing in loop
}

void sendTestData() {
  Serial.print("Connecting to Server: ");
  Serial.print(server);
  Serial.print(":");
  Serial.println(port);

  if (!client.connect(server, port)) {
    Serial.println("Connection failed!");
    return;
  }
  Serial.println("Connected to Server!");

  // Prepare JSON Payload
  String jsonPayload = "{\"device_id\":\"test_arduino_ino\",\"latitude\":28.7041,\"longitude\":77.1025,\"speed_kmh\":5,\"source\":\"test_ino\"}";

  // Send HTTP POST Request
  client.print(String("POST ") + resource + " HTTP/1.1\r\n");
  client.print(String("Host: ") + server + "\r\n");
  client.print("Content-Type: application/json\r\n");
  client.print("Connection: close\r\n");
  client.print(String("Content-Length: ") + jsonPayload.length() + "\r\n");
  client.print("\r\n");
  client.print(jsonPayload);

  Serial.println("Data Sent. Waiting for response...");

  // Read Response
  unsigned long timeout = millis();
  while (client.connected() && millis() - timeout < 10000) {
    if (client.available()) {
      String line = client.readStringUntil('\n');
      Serial.println(line);
      timeout = millis(); // Reset timeout on data
    }
  }
  
  client.stop();
  Serial.println("\n--- TEST COMPLETE ---");
}
