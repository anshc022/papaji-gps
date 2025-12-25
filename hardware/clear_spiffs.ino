/*
 * ESP32 SPIFFS Clear Tool
 * Upload this sketch to wipe all offline data from ESP32
 * After clearing, upload your main firmware again
 */

#include <FS.h>
#include <SPIFFS.h>

void setup() {
  Serial.begin(115200);
  delay(2000);
  
  Serial.println("\n========================================");
  Serial.println("   ESP32 SPIFFS CLEANER");
  Serial.println("========================================\n");

  if (!SPIFFS.begin(true)) {
    Serial.println("[ERROR] SPIFFS Mount Failed!");
    return;
  }
  
  Serial.println("[OK] SPIFFS Mounted\n");

  // List all files before deletion
  Serial.println("Files BEFORE clearing:");
  Serial.println("------------------------");
  listFiles();
  
  delay(2000);
  
  // Delete all files
  Serial.println("\n[...] Deleting all files...\n");
  deleteAllFiles();
  
  // List files after deletion
  Serial.println("\nFiles AFTER clearing:");
  Serial.println("------------------------");
  listFiles();
  
  Serial.println("\n========================================");
  Serial.println("   ✅ SPIFFS CLEARED!");
  Serial.println("   Now upload your main firmware");
  Serial.println("========================================\n");
}

void loop() {
  // Nothing to do
  delay(10000);
}

void listFiles() {
  File root = SPIFFS.open("/");
  File file = root.openNextFile();
  
  bool hasFiles = false;
  while(file) {
    hasFiles = true;
    Serial.printf("  📄 %s (%d bytes)\n", file.name(), file.size());
    file = root.openNextFile();
  }
  
  if (!hasFiles) {
    Serial.println("  (No files found)");
  }
}

void deleteAllFiles() {
  File root = SPIFFS.open("/");
  File file = root.openNextFile();
  
  int count = 0;
  while(file) {
    String fileName = String(file.name());
    file.close();
    
    if (SPIFFS.remove(fileName)) {
      Serial.printf("  ✅ Deleted: %s\n", fileName.c_str());
      count++;
    } else {
      Serial.printf("  ❌ Failed to delete: %s\n", fileName.c_str());
    }
    
    file = root.openNextFile();
  }
  
  Serial.printf("\n✅ Total files deleted: %d\n", count);
}
