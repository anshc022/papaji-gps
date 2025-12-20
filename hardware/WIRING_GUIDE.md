# Papaji GPS - Pro Hardware Wiring Guide

## ⚡ The "UPS" Power System (Critical)
This setup ensures the tracker runs even if the tractor is turned off or wires are cut.

**Components Needed:**
1.  **Buck Converter (LM2596):** Converts Tractor 12V $\to$ 5V.
2.  **TP4056 Charging Module:** Charges the battery safely.
3.  **18650 Li-ion Battery (1800mAh+):** The backup power.
4.  **ESP32 & Modules.**

### Power Wiring Chain:
1.  **Tractor Battery (12V)** $\to$ **Buck Converter IN**
2.  **Buck Converter OUT (Set to 5V)** $\to$ **TP4056 IN+ / IN-**
3.  **TP4056 BAT+ / BAT-** $\to$ **18650 Battery**
4.  **TP4056 OUT+ / OUT-** $\to$ **System Power (VCC/GND)**

---

## 🔌 Pin Connections

### 1. System Power (From TP4056 OUT)
| Component | Pin | Connect To | Note |
| :--- | :--- | :--- | :--- |
| **ESP32** | 5V / VIN | TP4056 OUT+ | Powers the brain |
| **ESP32** | GND | TP4056 OUT- | Common Ground |
| **SIM800L** | VCC | TP4056 OUT+ | **Must be 3.7V - 4.2V** (Battery level is perfect) |
| **SIM800L** | GND | TP4056 OUT- | Common Ground |
| **NEO-6M** | VCC | ESP32 3.3V | GPS uses low power |
| **NEO-6M** | GND | ESP32 GND | |

### 2. Data Connections (ESP32)

#### A. GPS Module (NEO-6M)
| GPS Pin | ESP32 Pin | Function |
| :--- | :--- | :--- |
| **TX** | **GPIO 16** (RX2) | ESP32 reads location |
| **RX** | **GPIO 17** (TX2) | ESP32 configures GPS |

#### B. GSM Module (SIM800L)
| GSM Pin | ESP32 Pin | Function |
| :--- | :--- | :--- |
| **TX** | **GPIO 4** | ESP32 reads network status |
| **RX** | **GPIO 2** | ESP32 sends data to cloud |

---

## ⚠️ Important Assembly Tips
1.  **Common Ground:** Ensure ALL GND pins (Tractor, Buck, Battery, ESP32, SIM800L) are connected together. If not, data will fail.
2.  **Capacitor:** Add a **1000uF Capacitor** across the SIM800L VCC/GND pins. This prevents restarts during network bursts.
3.  **Soldering:** Do not use jumper wires for the tractor. Solder wires to a Perfboard (Zero PCB) to withstand vibration.
4.  **Antennas:** Keep the GPS antenna (Ceramic square) facing **UP** towards the sky. Keep the GSM spring antenna away from the GPS antenna.

## 🛠️ Flashing Instructions
1.  Connect ESP32 to PC via USB.
2.  Open `hardware` folder in VS Code.
3.  Click **PlatformIO Icon** (Alien) $\to$ **Upload**.
4.  Once uploaded, disconnect USB and connect to the Battery setup.
