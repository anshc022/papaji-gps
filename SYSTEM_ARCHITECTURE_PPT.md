# Papaji GPS Tracker - System Architecture & Features
## Professional Tractor Tracking System (Pro Mode)

---

### Slide 1: Project Overview
**Title:** Papaji GPS - Smart Tractor Tracking System
**Goal:** To build a low-cost, high-reliability GPS tracker specifically designed for rural agricultural use (Tractors).
**Key Philosophy:** "Software over Hardware" – Using advanced logic to replace expensive sensors.

---

### Slide 2: High-Level Architecture
**The 3-Pillar System:**

1.  **Hardware (The Edge):**
    *   **ESP32 (Dual Core):** The brain. Handles GPS parsing, logic, and buffering.
    *   **SIM800L (GPRS):** Connectivity. Sends data to the cloud.
    *   **NEO-6M (GPS):** Location. Provides Lat/Lon/Speed.
    *   **Power:** Direct 12V Tractor Battery -> 5V Buck Converter.

2.  **Backend (The Brain):**
    *   **Node.js + Express:** API Server.
    *   **Supabase (PostgreSQL):** Database for history and user data.
    *   **AI Logic:** Route Learning, Deviation Detection, Speed Analysis.

3.  **Mobile App (The Interface):**
    *   **React Native (Expo):** Cross-platform (Android/iOS).
    *   **Real-time Dashboard:** Live tracking, History playback.
    *   **Controls:** Remote Diagnosis, Learning Mode trigger.

---

### Slide 3: Hardware Logic - "The Pro Features"
*Why this is better than a standard tracker:*

*   **1. Smart Interval:**
    *   *Moving:* Updates every 5 seconds (High precision).
    *   *Parked:* Updates every 5 minutes (Saves Data & Power).
*   **2. Smart Cornering:**
    *   Detects turns (> 30 degrees) and forces an immediate update.
    *   Result: Smooth curves on the map, not jagged lines.
*   **3. Data Batching:**
    *   Buffers 12 points in RAM before sending.
    *   Reduces SIM data usage by 80% (fewer HTTP headers).
*   **4. GPS Drift Filter:**
    *   Ignores small movements (< 1km/h) when parked.
    *   Prevents "Ghost Mileage" (fake distance accumulation).

---

### Slide 4: Reliability & Failsafes
*What happens when things go wrong?*

*   **Scenario A: No Signal (Dead Zone)**
    *   **Solution:** "Black Box Mode" (SPIFFS).
    *   Data is saved to internal flash memory.
    *   Auto-uploads when signal returns.
*   **Scenario B: GPS Failure (Tunnel/Shed)**
    *   **Solution:** GSM LBS Fallback.
    *   Uses Cell Towers to triangulate approximate location.
*   **Scenario C: System Freeze**
    *   **Solution:** Hardware Watchdog Timer (WDT).
    *   Auto-restarts the ESP32 if it hangs for > 8 seconds.

---

### Slide 5: Advanced AI Features (The "Brain")
*Software replacing Hardware sensors:*

*   **1. Auto-Learning Route (Corridor Lock):**
    *   **Phase 1:** "Learning Mode" (48 Hours). Records the daily path (Field <-> Mill).
    *   **Phase 2:** "Active Guard". Locks this path as the "Safe Route".
    *   **Alert:** Triggers if tractor deviates > 500m from the path.
*   **2. Adaptive Speed Limit:**
    *   Learns the tractor's normal max speed during the learning phase.
    *   Sets a dynamic limit (Max + 20%).
    *   Alerts on over-speeding (Driver abuse).
*   **3. Auto-Diagnosis:**
    *   App button runs a full system check.
    *   Checks: Connectivity, GPS Signal Strength, Voltage.
    *   Action: Can send a remote "Restart" command to fix issues.

---

### Slide 6: Data Flow Diagram
1.  **Satellite** -> (NMEA Data) -> **ESP32**
2.  **ESP32** -> (Filter/Batch) -> **SIM800L**
3.  **SIM800L** -> (JSON POST) -> **Node.js Server**
4.  **Node.js** -> (Insert) -> **Supabase DB**
5.  **Node.js** -> (Analyze) -> **Deviation/Speed Check**
6.  **User App** <- (Fetch) <- **Node.js API**

---

### Slide 7: Future Scope
*   **Fuel Monitoring:** Using voltage drop analysis (Software only).
*   **Geofence Scheduling:** Different allowed zones for Day vs Night.
*   **Multi-Tractor Fleet:** Scaling the backend for 100+ devices.

---
