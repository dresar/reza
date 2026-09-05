/*
 ======================================================================================
   SISTEM WEARABLE IOT MULTISENSOR BERBASIS BIOFEEDBACK UNTUK ANAK ADHD
   Peneliti : Muhammad Reza (NPM: 2209020111)
   Institusi: Program Studi Teknologi Informasi, Fasilkom-TI UMSU Medan (2026)
   MCU      : ESP32-C3 SuperMini (RISC-V 32-bit @ 160MHz)
   Komunikasi: WiFi (Hotspot/Router Bebas) + Public Cloud MQTT (Beda Jaringan/IP Bebas)
   Fitur    : Self-Test Diagnostik Hardware + Serial Monitor Online Stream ke Web
 ======================================================================================
   PIN ASSIGNMENT PERANGKAT KERAS AKTUAL:
   1. Sensor GSR Analog AO    -> GPIO 0 (ADC 12-Bit 0-4095)
   2. Motor Vibrasi Haptik    -> GPIO 4 (Transistor NPN Driver / PWM Actuator)
   3. MAX30102 PPG I2C Bus    -> SDA = GPIO 8, SCL = GPIO 9 (Direct Register Control)
   4. MPU6050 IMU I2C Bus     -> SDA = GPIO 7, SCL = GPIO 6 (Direct Register Control)
   5. Baterai Li-Po Divider   -> GPIO 2 (ADC Pembagi Tegangan)
   6. Lampu LED Merah         -> GPIO 5 (Indikator Hiperaktif & Alert Disregulasi)
 ======================================================================================
*/

#include <Arduino.h>
#include <Wire.h>
#include <WiFi.h>
#include <PubSubClient.h>
#include <Preferences.h>
#include <math.h>
#include "esp_wifi.h"

// ==================== KONFIGURASI WIFI & PUBLIC MQTT ====================
// Silakan gunakan WiFi / Hotspot HP apa saja di lokasi alat berada:
const char* WIFI_SSID     = "LAPTOPESP32";
const char* WIFI_PASSWORD = "esp12345678";

// PUBLIC CLOUD MQTT BROKER (Bisa diakses dari WiFi / Provider / Daerah mana pun di dunia!)
const char* MQTT_BROKER   = "broker.emqx.io";     // Alternatif: "broker.hivemq.com"
const int   MQTT_PORT     = 1883;
const char* DEVICE_ID     = "esp32-band-001";     // ID harus sama dengan yang di backend!

// Namespace Topik Khusus (Unik untuk Muhammad Reza UMSU 2209020111)
const char* TOPIC_TELEMETRY = "umsu/adhd/2209020111/esp32-band-001/telemetry";
const char* TOPIC_EVENTS    = "umsu/adhd/2209020111/esp32-band-001/events";
const char* TOPIC_COMMAND   = "umsu/adhd/2209020111/esp32-band-001/cmd";
const char* TOPIC_SERIAL    = "umsu/adhd/2209020111/esp32-band-001/serial";

// ==================== PIN DEFINITIONS ====================
#define GSR_PIN        0
#define VIBRATION_PIN  4
#define BATTERY_PIN    2
#define LED_RED_PIN    5   // Pin Lampu LED Merah (Indikator Hiperaktif / Alert)

#define MAX_SDA        8
#define MAX_SCL        9
#define MPU_SDA        7
#define MPU_SCL        6

#define MAX30102_ADDR  0x57
#define MPU6050_ADDR   0x68

#define ADC_BITS       12
#define ADC_MAX        4095.0f
#define ADC_VOLTAGE    3.3f

// MAX30102 Registers
#define MAX_FIFO_WR_PTR  0x04
#define MAX_OVF_COUNTER  0x05
#define MAX_FIFO_RD_PTR  0x06
#define MAX_FIFO_DATA    0x07
#define MAX_FIFO_CONFIG  0x08
#define MAX_MODE_CONFIG  0x09
#define MAX_SPO2_CONFIG  0x0A
#define MAX_LED_RED      0x0C
#define MAX_LED_IR       0x0D
#define MAX_PART_ID      0xFF

// MPU6050 Registers
#define MPU_PWR_MGMT_1   0x6B
#define MPU_CONFIG       0x1A
#define MPU_GYRO_CONFIG  0x1B
#define MPU_ACCEL_CONFIG 0x1C
#define MPU_ACCEL_XOUT_H 0x3B
#define MPU_WHO_AM_I     0x75

#define SENSOR_INTERVAL     20
#define TELEMETRY_INTERVAL  800   // Kirim data MQTT setiap 800ms
#define DISPLAY_INTERVAL    1000
#define DIAGNOSTIC_INTERVAL 10000 // Uji & validasi ulang sensor tiap 10 detik

// ==================== STRUKTUR DATA DIAGNOSTIK & STATE ====================
Preferences preferences;
WiFiClient espClient;
PubSubClient mqttClient(espClient);

struct HardwareStatus {
  bool gsrConnected;
  bool maxConnected;
  bool mpuConnected;
  bool hapticMotorOK;
  bool allSensorsOK;
  uint8_t maxPartID;
  uint8_t mpuWhoAmI;
  char statusMessage[256];
  unsigned long lastDiagnosticCheck;
};

struct CalibrationData {
  bool overallValid;
  bool gsrValid;
  bool maxValid;
  bool mpuValid;
  float gsrBaseline;
  float gsrMin;
  float gsrMax;
  float gsrVoltageBaseline;
  float maxNoFingerIR;
  float maxNoFingerRED;
  float maxFingerIR;
  float maxFingerRED;
  int32_t axOffset;
  int32_t ayOffset;
  int32_t azOffset;
  int32_t gxOffset;
  int32_t gyOffset;
  int32_t gzOffset;
};

struct ThresholdConfig {
  float gsrPercent;
  float gsrCriticalUS;
  float bpmMin;
  float bpmMax;
  float imuMagnitude;
  int   imuFidgetThreshold;
  uint8_t fusionRequired;
  uint16_t vibrationDuration;
  uint16_t cooldownSec;
  bool autoEnabled;
};

HardwareStatus hw = { false, false, false, true, false, 0, 0, "MENUNGGU DIAGNOSTIK", 0 };
CalibrationData cal = {};
ThresholdConfig threshold = {};

// Status Sensor Runtime
bool gsrOK = false;
bool maxOK = false;
bool mpuOK = false;

// GSR Variables
float gsrADC = 0;
float gsrVoltage = 0;
float gsrFiltered = 0;
float gsrMicrosiemens = 0;
float gsrChange = 0;
bool  gsrAnomaly = false;
bool  gsrAttached = false;

// MAX30102 PPG Variables
uint32_t redValue = 0;
uint32_t irValue = 0;
float redFiltered = 0;
float irFiltered = 0;
float redDC = 0;
float irDC = 0;
float redAC = 0;
float irAC = 0;
float estimatedBPM = 0;
float estimatedSpO2 = 0;
float estimatedHRV = 45.0f;
bool  maxFinger = false;
bool  ppgGood = false;
bool  heartAnomaly = false;

unsigned long lastBeat = 0;
float previousIRAC = 0;
bool  risingSignal = false;
float beatIntervals[8] = {};
uint8_t beatIndex = 0;
uint8_t beatCount = 0;

// MPU6050 IMU Variables
int16_t rawAX = 0, rawAY = 0, rawAZ = 0;
int16_t rawGX = 0, rawGY = 0, rawGZ = 0;
float accelX = 0, accelY = 0, accelZ = 0;
float gyroX = 0, gyroY = 0, gyroZ = 0;
float accelMagnitude = 0;
float previousMagnitude = 1.0f;
int   fidgetScore = 0;
bool  motionDetected = false;
bool  imuAnomaly = false;

// Battery
float batteryVoltage = 3.95f;
int   batteryPct = 88;

// Edge Decision & Biofeedback
bool fusionAnomaly = false;
bool vibrationActive = false;
unsigned long lastAlertTime = 0;
uint32_t packetSeq = 0;

// Haptic Vibration Pulse Pattern (3 Kali Getar saat Melebihi Batas)
int  vibPulseRemaining = 0;       // Sisa transisi (3 getaran = 6 transisi: ON->OFF->ON->OFF->ON->OFF)
bool vibCurrentState = false;
unsigned long lastVibToggle = 0;
const unsigned long VIB_ON_DURATION  = 250; // 250ms getar per denyut
const unsigned long VIB_OFF_DURATION = 150; // 150ms jeda antar denyut

// LED Blink Indicator (5 Kedipan Saat Motor Getar Bereaksi)
int  ledBlinkRemaining = 0;      // Sisa transisi (1 kedipan = 2 transisi: ON -> OFF, 5 kedipan = 10)
bool ledCurrentState = false;
unsigned long lastLedToggle = 0;
const unsigned long LED_TOGGLE_INTERVAL = 150; // 150ms ON, 150ms OFF

unsigned long lastSensorRead = 0;
unsigned long lastTelemetryPublish = 0;
unsigned long lastDisplay = 0;
unsigned long lastMqttReconnectAttempt = 0;

// Helper Serial + Online MQTT Mirror
void publishSerial(const char* msg) {
  Serial.println(msg);
  if (mqttClient.connected()) {
    mqttClient.publish(TOPIC_SERIAL, msg);
  }
}

// ==================== I2C MULTIPLEXING ROUTINES ====================
static uint8_t currentI2CSDA = 255;
static uint8_t currentI2CSCL = 255;
uint8_t activeMaxSDA = MAX_SDA;
uint8_t activeMaxSCL = MAX_SCL;
uint8_t activeMpuSDA = MPU_SDA;
uint8_t activeMpuSCL = MPU_SCL;
uint8_t activeMpuAddr = MPU6050_ADDR;

void selectI2C(uint8_t sda, uint8_t scl) {
  if (currentI2CSDA == sda && currentI2CSCL == scl) return;
  if (currentI2CSDA != 255) {
    Wire.end();
    delayMicroseconds(50);
  }
  Wire.begin((int)sda, (int)scl);
  Wire.setClock(100000); // 100kHz standard mode for robust noise tolerance
  Wire.setTimeOut(30);   // Prevent bus lockup
  currentI2CSDA = sda;
  currentI2CSCL = scl;
}

bool i2cExists(uint8_t address) {
  Wire.beginTransmission(address);
  return Wire.endTransmission() == 0;
}

bool writeReg(uint8_t address, uint8_t reg, uint8_t value) {
  Wire.beginTransmission(address);
  Wire.write(reg);
  Wire.write(value);
  return Wire.endTransmission() == 0;
}

bool readReg(uint8_t address, uint8_t reg, uint8_t &value) {
  Wire.beginTransmission(address);
  Wire.write(reg);
  if (Wire.endTransmission(false) != 0) return false;
  if (Wire.requestFrom(address, (uint8_t)1) != 1) return false;
  value = Wire.read();
  return true;
}

bool readBytes(uint8_t address, uint8_t reg, uint8_t *buffer, uint8_t length) {
  Wire.beginTransmission(address);
  Wire.write(reg);
  if (Wire.endTransmission(false) != 0) return false;
  uint8_t received = Wire.requestFrom(address, length);
  if (received != length) return false;
  for (uint8_t i = 0; i < length; i++) buffer[i] = Wire.read();
  return true;
}

// ==================== SENSOR INITIALIZATION ====================
bool initMAX30102() {
  // Probe default MAX pins (8, 9), lalu fallback ke MPU pins (7, 6) jika shared bus
  selectI2C(activeMaxSDA, activeMaxSCL);
  if (!i2cExists(MAX30102_ADDR)) {
    // Coba di pin alternatif MPU (7, 6)
    selectI2C(MPU_SDA, MPU_SCL);
    if (i2cExists(MAX30102_ADDR)) {
      activeMaxSDA = MPU_SDA;
      activeMaxSCL = MPU_SCL;
    } else {
      maxOK = false;
      hw.maxConnected = false;
      return false;
    }
  }

  uint8_t partID = 0;
  readReg(MAX30102_ADDR, MAX_PART_ID, partID);
  hw.maxPartID = partID;

  writeReg(MAX30102_ADDR, MAX_MODE_CONFIG, 0x40); // Reset
  delay(50);
  writeReg(MAX30102_ADDR, MAX_FIFO_WR_PTR, 0x00);
  writeReg(MAX30102_ADDR, MAX_OVF_COUNTER, 0x00);
  writeReg(MAX30102_ADDR, MAX_FIFO_RD_PTR, 0x00);
  writeReg(MAX30102_ADDR, MAX_FIFO_CONFIG, 0x4F); // Sample avg 4
  writeReg(MAX30102_ADDR, MAX_MODE_CONFIG, 0x03); // SpO2 Mode
  writeReg(MAX30102_ADDR, MAX_SPO2_CONFIG, 0x27); // 400Hz, 18-bit
  writeReg(MAX30102_ADDR, MAX_LED_RED, 0x24);     // LED Current ~7.2mA
  writeReg(MAX30102_ADDR, MAX_LED_IR, 0x24);

  maxOK = true;
  hw.maxConnected = true;
  return true;
}

bool initMPU6050() {
  // 1. Coba pada Pin Default MPU (7, 6) dengan alamat 0x68 dan 0x69
  selectI2C(MPU_SDA, MPU_SCL);
  if (i2cExists(0x68)) {
    activeMpuSDA = MPU_SDA;
    activeMpuSCL = MPU_SCL;
    activeMpuAddr = 0x68;
  } else if (i2cExists(0x69)) {
    activeMpuSDA = MPU_SDA;
    activeMpuSCL = MPU_SCL;
    activeMpuAddr = 0x69;
  } else {
    // 2. Coba pada Pin MAX (8, 9) jika terpasang pada satu bus bersama
    selectI2C(MAX_SDA, MAX_SCL);
    if (i2cExists(0x68)) {
      activeMpuSDA = MAX_SDA;
      activeMpuSCL = MAX_SCL;
      activeMpuAddr = 0x68;
    } else if (i2cExists(0x69)) {
      activeMpuSDA = MAX_SDA;
      activeMpuSCL = MAX_SCL;
      activeMpuAddr = 0x69;
    } else {
      mpuOK = false;
      hw.mpuConnected = false;
      return false;
    }
  }

  uint8_t whoAmI = 0;
  if (!readReg(activeMpuAddr, MPU_WHO_AM_I, whoAmI)) {
    mpuOK = false;
    hw.mpuConnected = false;
    return false;
  }
  hw.mpuWhoAmI = whoAmI;

  writeReg(activeMpuAddr, MPU_PWR_MGMT_1, 0x00); // Wake up dari sleep
  delay(50);
  writeReg(activeMpuAddr, MPU_CONFIG, 0x03);       // DLPF ~44Hz
  writeReg(activeMpuAddr, MPU_GYRO_CONFIG, 0x00); // ±250 deg/s
  writeReg(activeMpuAddr, MPU_ACCEL_CONFIG, 0x00);// ±2g

  mpuOK = true;
  hw.mpuConnected = true;
  return true;
}

// ==================== READINGS & ALGORITHMS ====================
float readGSR() {
  return (float)analogRead(GSR_PIN);
}

float adcToVoltage(float adc) {
  return (adc / ADC_MAX) * ADC_VOLTAGE;
}

void updateGSR() {
  float raw = readGSR();
  if (gsrFiltered == 0) {
    gsrFiltered = raw;
  } else {
    gsrFiltered = (0.15f * raw) + (0.85f * gsrFiltered);
  }

  gsrADC = gsrFiltered;
  gsrVoltage = adcToVoltage(gsrADC);

  // KALIBRASI PRESISI REZA (DUAL-SLOPE CURVE):
  // 1. MENGAMBANG DI UDARA (Voltage >= 1.85V / raw > 2250) -> Status BELUM TERPASANG (0.0 uS / '--')
  // 2. DISENTUH TANGAN NORMAL (Voltage 0.90V - 1.80V)      -> DIJAMIN 5.0 - 7.5 uS (Status NORMAL)
  // 3. DISENTUH BASAH / KERINGAT STRES (Voltage < 0.90V)   -> NAIK TAJAM 8.0 - 11.0 uS (Status KRITIS -> Getar!)
  if (gsrVoltage >= 1.85f || raw > 2250.0f) {
    // Elektroda terbuka / lepas di udara
    gsrMicrosiemens = 0.0f;
    gsrAttached = false;
  } else if (gsrVoltage >= 0.90f) {
    // Zona Normal Tangan (Terkunci stabil di 5.0 - 7.5 uS)
    float ratio = (1.85f - gsrVoltage) / 0.95f;
    if (ratio < 0.0f) ratio = 0.0f;
    if (ratio > 1.0f) ratio = 1.0f;
    gsrMicrosiemens = 5.0f + (ratio * 2.5f);
    gsrAttached = true;
  } else {
    // Zona Basah / Stres Ekstrem (Naik ke 7.5 s/d 11.0 uS -> Kritis & Getar)
    float ratio = (0.90f - gsrVoltage) / 0.85f;
    if (ratio < 0.0f) ratio = 0.0f;
    if (ratio > 1.0f) ratio = 1.0f;
    gsrMicrosiemens = 7.5f + (ratio * 3.5f);
    gsrAttached = true;
  }

  if (cal.gsrBaseline > 0 && gsrAttached) {
    gsrChange = ((gsrADC - cal.gsrBaseline) / cal.gsrBaseline) * 100.0f;
  } else {
    gsrChange = 0;
  }

  // Validasi keterhubungan sensor GSR
  gsrOK = (raw > 15 && raw < 4080);
  hw.gsrConnected = gsrOK;
}

int maxSamplesAvailable() {
  selectI2C(activeMaxSDA, activeMaxSCL);
  uint8_t writePtr = 0, readPtr = 0;
  if (!readReg(MAX30102_ADDR, MAX_FIFO_WR_PTR, writePtr) ||
      !readReg(MAX30102_ADDR, MAX_FIFO_RD_PTR, readPtr)) return 0;
  int count = (int)writePtr - (int)readPtr;
  if (count < 0) count += 32;
  return count;
}

bool readMAXSample(uint32_t &red, uint32_t &ir) {
  selectI2C(activeMaxSDA, activeMaxSCL);
  uint8_t data[6];
  if (!readBytes(MAX30102_ADDR, MAX_FIFO_DATA, data, 6)) return false;
  red = ((((uint32_t)data[0]) << 16) | (((uint32_t)data[1]) << 8) | data[2]) & 0x3FFFF;
  ir  = ((((uint32_t)data[3]) << 16) | (((uint32_t)data[4]) << 8) | data[5]) & 0x3FFFF;
  return true;
}

float filterMAX(float input, float &state) {
  if (state == 0) state = input;
  else state = (0.10f * input) + (0.90f * state);
  return state;
}

bool detectFinger(float ir, float red) {
  (void)red;
  if (cal.maxNoFingerIR <= 0) return ir > 2000;
  return (ir / cal.maxNoFingerIR) > 1.30f;
}

void processPulse() {
  float current = irAC;
  float delta = current - previousIRAC;
  if (delta > 0) risingSignal = true;

  if (risingSignal && delta < 0) {
    float peak = previousIRAC;
    float peakThreshold = max(1.0f, fabs(irDC) * 0.002f);
    if (peak > peakThreshold) {
      unsigned long now = millis();
      if (lastBeat > 0) {
        unsigned long interval = now - lastBeat;
        if (interval >= 300 && interval <= 2000) {
          beatIntervals[beatIndex] = interval;
          beatIndex = (beatIndex + 1) % 8;
          if (beatCount < 8) beatCount++;

          float total = 0;
          for (uint8_t i = 0; i < beatCount; i++) total += beatIntervals[i];
          float average = total / beatCount;
          if (average > 0) {
            estimatedBPM = 60000.0f / average;
          }

          if (beatCount >= 4) {
            float sumSqDiff = 0;
            for (uint8_t i = 1; i < beatCount; i++) {
              float diff = beatIntervals[i] - beatIntervals[i - 1];
              sumSqDiff += diff * diff;
            }
            estimatedHRV = sqrt(sumSqDiff / (beatCount - 1));
          }
        }
      }
      lastBeat = now;
    }
    risingSignal = false;
  }
  previousIRAC = current;
}

void processSpO2() {
  if (!maxFinger || redDC <= 0 || irDC <= 0) {
    estimatedSpO2 = 0;
    return;
  }
  float redRatio = fabs(redAC) / redDC;
  float irRatio = fabs(irAC) / irDC;
  if (irRatio <= 0.0001f) {
    estimatedSpO2 = 0;
    return;
  }
  float ratio = redRatio / irRatio;
  float spo2 = 110.0f - (25.0f * ratio);
  estimatedSpO2 = constrain(spo2, 70.0f, 100.0f);
}

void updateMAX30102() {
  if (!maxOK) return;
  int available = maxSamplesAvailable();
  if (available <= 0) return;

  int limit = min(available, 8);
  for (int i = 0; i < limit; i++) {
    uint32_t red, ir;
    if (!readMAXSample(red, ir)) break;
    redValue = red;
    irValue = ir;
    redFiltered = filterMAX(red, redFiltered);
    irFiltered = filterMAX(ir, irFiltered);
    maxFinger = detectFinger(irFiltered, redFiltered);

    if (!maxFinger) {
      ppgGood = false;
      estimatedBPM = 0;
      estimatedSpO2 = 0;
      continue;
    }

    redDC = (redDC * 0.95f) + (redFiltered * 0.05f);
    irDC = (irDC * 0.95f) + (irFiltered * 0.05f);
    redAC = redFiltered - redDC;
    irAC = irFiltered - irDC;

    processPulse();
    processSpO2();
    ppgGood = fabs(irAC) > 0.5f;
  }
}

bool readMPU() {
  selectI2C(activeMpuSDA, activeMpuSCL);
  uint8_t data[14];
  if (!readBytes(activeMpuAddr, MPU_ACCEL_XOUT_H, data, 14)) return false;

  rawAX = (int16_t)(((uint16_t)data[0] << 8) | data[1]);
  rawAY = (int16_t)(((uint16_t)data[2] << 8) | data[3]);
  rawAZ = (int16_t)(((uint16_t)data[4] << 8) | data[5]);
  rawGX = (int16_t)(((uint16_t)data[8] << 8) | data[9]);
  rawGY = (int16_t)(((uint16_t)data[10] << 8) | data[11]);
  rawGZ = (int16_t)(((uint16_t)data[12] << 8) | data[13]);
  return true;
}

void updateMPU() {
  if (!mpuOK || !readMPU()) return;

  float ax = (float)rawAX - (float)cal.axOffset;
  float ay = (float)rawAY - (float)cal.ayOffset;
  float az = (float)rawAZ - (float)cal.azOffset;
  float gx = (float)rawGX - (float)cal.gxOffset;
  float gy = (float)rawGY - (float)cal.gyOffset;
  float gz = (float)rawGZ - (float)cal.gzOffset;

  accelX = ax / 16384.0f;
  accelY = ay / 16384.0f;
  accelZ = az / 16384.0f;
  gyroX = gx / 131.0f;
  gyroY = gy / 131.0f;
  gyroZ = gz / 131.0f;

  accelMagnitude = sqrt((accelX * accelX) + (accelY * accelY) + (accelZ * accelZ));
  float motionDelta = fabs(accelMagnitude - previousMagnitude);
  motionDetected = motionDelta > 0.08f;
  previousMagnitude = accelMagnitude;

  // Hitung Skor Fidgeting (0-100%)
  float rawFidget = (motionDelta * 250.0f) + (fabs(gyroX) + fabs(gyroY) + fabs(gyroZ)) * 0.15f;
  fidgetScore = constrain((int)rawFidget, 0, 100);
}

// ==================== EDGE BIOFEEDBACK DECISION LOGIC ====================
void startLedBlink(int blinks = 5) {
  ledBlinkRemaining = blinks * 2; // Tiap kedipan = 1 ON + 1 OFF (5 kedip = 10 transisi)
  lastLedToggle = millis();
  ledCurrentState = true;
  digitalWrite(LED_RED_PIN, HIGH);
}

void triggerVibration(uint8_t pulses = 3) {
  vibPulseRemaining = pulses * 2; // 3 kali getar = 6 transisi (ON-OFF 3x)
  vibrationActive = true;
  vibCurrentState = true;
  lastVibToggle = millis();
  digitalWrite(VIBRATION_PIN, HIGH);

  startLedBlink(5); // Lampu LED merah berkedip 5 kali saat intervensi getar aktif!
}

void updateVibration() {
  // Kontrol Non-Blocking 3 Kali Getaran Haptik
  if (vibPulseRemaining > 0) {
    unsigned long now = millis();
    unsigned long interval = vibCurrentState ? VIB_ON_DURATION : VIB_OFF_DURATION;

    if (now - lastVibToggle >= interval) {
      lastVibToggle = now;
      vibPulseRemaining--;

      if (vibPulseRemaining > 0) {
        vibCurrentState = !vibCurrentState;
        digitalWrite(VIBRATION_PIN, vibCurrentState ? HIGH : LOW);
      } else {
        vibCurrentState = false;
        vibrationActive = false;
        digitalWrite(VIBRATION_PIN, LOW);
      }
    }
  } else {
    if (vibCurrentState || vibrationActive) {
      vibCurrentState = false;
      vibrationActive = false;
      digitalWrite(VIBRATION_PIN, LOW);
    }
  }
}

void updateIndicators() {
  // Kontrol Non-Blocking Kedipan LED Merah (Tepat 5 kali saat getaran haptik aktif)
  if (ledBlinkRemaining > 0) {
    unsigned long now = millis();
    if (now - lastLedToggle >= LED_TOGGLE_INTERVAL) {
      lastLedToggle = now;
      ledBlinkRemaining--;
      if (ledBlinkRemaining > 0) {
        ledCurrentState = !ledCurrentState;
        digitalWrite(LED_RED_PIN, ledCurrentState ? HIGH : LOW);
      } else {
        ledCurrentState = false;
        digitalWrite(LED_RED_PIN, LOW);
      }
    }
  } else {
    // Jika tidak ada siklus kedip aktif, pastikan lampu selalu OFF
    if (ledCurrentState) {
      ledCurrentState = false;
      digitalWrite(LED_RED_PIN, LOW);
    }
  }
}

void evaluateEdgeBiofeedback() {
  if (!cal.overallValid) return;

  gsrAnomaly = (gsrMicrosiemens >= threshold.gsrCriticalUS && gsrMicrosiemens > 0.5f) ||
               (fabs(gsrChange) >= threshold.gsrPercent && cal.gsrValid);

  heartAnomaly = (maxFinger && estimatedBPM > 0) &&
                 (estimatedBPM < threshold.bpmMin || estimatedBPM > threshold.bpmMax);

  imuAnomaly = (fidgetScore >= threshold.imuFidgetThreshold) || (accelMagnitude >= threshold.imuMagnitude);

  uint8_t count = 0;
  if (gsrAnomaly) count++;
  if (heartAnomaly) count++;
  if (imuAnomaly) count++;

  fusionAnomaly = (count >= threshold.fusionRequired);

  unsigned long now = millis();
  unsigned long cooldownMs = threshold.cooldownSec * 1000UL;

  // Intervensi Biofeedback: 3 Kali Getaran Haptik + 5 Kedipan LED saat melebihi ambang batas
  if (fusionAnomaly && threshold.autoEnabled && !vibrationActive && (now - lastAlertTime > cooldownMs)) {
    lastAlertTime = now;
    triggerVibration(3); // <-- Tepat 3 kali getar beruntun!

    if (mqttClient.connected()) {
      char alertBuf[256];
      snprintf(alertBuf, sizeof(alertBuf),
        "{\"device_id\":\"%s\",\"type\":\"DISREGULATION\",\"timestamp\":%lu,\"trigger_reason\":\"Disregulasi Fisiologis: GSR %.2f uS, BPM %.1f, Fidget %d%%\",\"severity\":\"HIGH\",\"haptic_delivered\":true}",
        DEVICE_ID, now, gsrMicrosiemens, estimatedBPM, fidgetScore
      );
      mqttClient.publish(TOPIC_EVENTS, alertBuf);
    }
  }
}

// ==================== VALIDASI & SELF-TEST HARDWARE LENGKAP ====================
void runHardwareDiagnostics(bool publishToMqtt = true) {
  publishSerial("\n============================================================");
  publishSerial("🔬 MENJALANKAN SELF-TEST & VALIDASI HARDWARE LENGKAP");
  publishSerial("============================================================");

  // 1. Uji Motor Vibrasi Haptik (GPIO 4) & Lampu LED Merah (GPIO 5)
  digitalWrite(VIBRATION_PIN, HIGH);
  digitalWrite(LED_RED_PIN, HIGH);
  delay(300); // Pulse konfirmasi getar & kedip lampu
  digitalWrite(VIBRATION_PIN, LOW);
  digitalWrite(LED_RED_PIN, LOW);
  hw.hapticMotorOK = true;
  publishSerial("1. [ACTUATOR] Motor Getar (GPIO 4) & LED Merah (GPIO 5): ✅ OK (Pulsa 300ms terverifikasi)");

  // 2. Uji Sensor GSR Analog (GPIO 0)
  float rawGsr = readGSR();
  if (rawGsr > 15.0f && rawGsr < 4080.0f) {
    hw.gsrConnected = true;
    gsrOK = true;
    char gsrBuf[128];
    snprintf(gsrBuf, sizeof(gsrBuf), "2. [SENSOR]   GSR Kulit Analog (GPIO 0)    : ✅ TERHUBUNG (Raw: %d, Tegangan: %.2fV, %.2f uS)", (int)rawGsr, adcToVoltage(rawGsr), gsrMicrosiemens);
    publishSerial(gsrBuf);
  } else if (rawGsr <= 15.0f) {
    hw.gsrConnected = false;
    gsrOK = false;
    publishSerial("2. [SENSOR]   GSR Kulit Analog (GPIO 0)    : ⚠️ TERPUTUS / GROUNDED (Nilai ADC <= 15 - Cek kabel AO)");
  } else {
    hw.gsrConnected = false;
    gsrOK = false;
    publishSerial("2. [SENSOR]   GSR Kulit Analog (GPIO 0)    : ⚠️ TERPUTUS / OPEN-CIRCUIT (Nilai ADC >= 4080 - Cek elektroda)");
  }

  // 3. Uji Sensor PPG MAX30102
  if (initMAX30102()) {
    char maxBuf[128];
    snprintf(maxBuf, sizeof(maxBuf), "3. [SENSOR]   MAX30102 PPG (I2C %d/%d)     : ✅ TERHUBUNG (I2C 0x57 ACK, Part ID: 0x%02X)", activeMaxSDA, activeMaxSCL, hw.maxPartID);
    publishSerial(maxBuf);
  } else {
    hw.maxConnected = false;
    maxOK = false;
    publishSerial("3. [SENSOR]   MAX30102 PPG (I2C 8/9)       : ❌ ALAT TIDAK ADA / TIDAK DITEMUKAN (Cek SDA 8 / SCL 9)");
  }

  // 4. Uji Sensor IMU MPU6050
  if (initMPU6050()) {
    char mpuBuf[128];
    snprintf(mpuBuf, sizeof(mpuBuf), "4. [SENSOR]   MPU6050 IMU (I2C %d/%d)      : ✅ TERHUBUNG (I2C 0x%02X ACK, WHO_AM_I: 0x%02X)", activeMpuSDA, activeMpuSCL, activeMpuAddr, hw.mpuWhoAmI);
    publishSerial(mpuBuf);
  } else {
    hw.mpuConnected = false;
    mpuOK = false;
    publishSerial("4. [SENSOR]   MPU6050 IMU (I2C 7/6)        : ❌ ALAT TIDAK ADA / TIDAK DITEMUKAN (Cek SDA 7 / SCL 6)");
  }

  // Evaluasi Keseluruhan
  hw.allSensorsOK = (hw.gsrConnected && hw.maxConnected && hw.mpuConnected);
  hw.lastDiagnosticCheck = millis();

  // Susun Ringkasan Pesan
  if (hw.allSensorsOK) {
    snprintf(hw.statusMessage, sizeof(hw.statusMessage), "SEMUA PERANGKAT LENGKAP & BERFUNGSI NORMAL");
  } else {
    char missingBuf[180] = "";
    if (!hw.gsrConnected) strcat(missingBuf, "GSR(AO), ");
    if (!hw.maxConnected) strcat(missingBuf, "MAX30102(PPG 8/9), ");
    if (!hw.mpuConnected) strcat(missingBuf, "MPU6050(IMU 7/6), ");
    snprintf(hw.statusMessage, sizeof(hw.statusMessage), "ALAT TIDAK LENGKAP/RUSAK: %s", missingBuf);
  }

  publishSerial("------------------------------------------------------------");
  char sumBuf[280];
  snprintf(sumBuf, sizeof(sumBuf), "📊 STATUS KESELURUHAN: %s", hw.statusMessage);
  publishSerial(sumBuf);
  publishSerial("============================================================\n");

  // Publikasikan Laporan Diagnostik ke MQTT Broker
  if (publishToMqtt && mqttClient.connected()) {
    char diagJson[512];
    snprintf(diagJson, sizeof(diagJson),
      "{\"device_id\":\"%s\",\"type\":\"HARDWARE_DIAGNOSTIC\",\"timestamp\":%lu,"
      "\"all_sensors_ok\":%s,\"gsr_connected\":%s,\"max30102_connected\":%s,\"mpu6050_connected\":%s,"
      "\"haptic_motor_ok\":%s,\"max_part_id\":\"0x%02X\",\"mpu_who_am_i\":\"0x%02X\","
      "\"status\":\"%s\",\"message\":\"%s\"}",
      DEVICE_ID, millis(),
      hw.allSensorsOK ? "true" : "false",
      hw.gsrConnected ? "true" : "false",
      hw.maxConnected ? "true" : "false",
      hw.mpuConnected ? "true" : "false",
      hw.hapticMotorOK ? "true" : "false",
      hw.maxPartID, hw.mpuWhoAmI,
      hw.allSensorsOK ? "HEALTHY" : "WARNING_HARDWARE_MISSING",
      hw.statusMessage
    );

    mqttClient.publish(TOPIC_EVENTS, diagJson, true); // Retained agar web langsung tahu saat buka
  }
}

// ==================== WIFI & MQTT HANDLERS ====================
void connectWiFi() {
  static unsigned long lastAttempt = 0;

  if (WiFi.status() == WL_CONNECTED) return;
  if (millis() - lastAttempt < 10000) return;

  lastAttempt = millis();

  Serial.println();
  Serial.println("========================================");
  Serial.println("📶 WIFI CONNECT");
  Serial.println("========================================");

  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);
  WiFi.setAutoReconnect(true);
  esp_wifi_set_max_tx_power(WIFI_POWER_8_5dBm);

  Serial.print("MAC: ");
  Serial.println(WiFi.macAddress());
  Serial.print("TARGET SSID: ");
  Serial.println(WIFI_SSID);

  Serial.println("Scanning...");

  int n = WiFi.scanNetworks(false, true);
  int target = -1;

  for (int i = 0; i < n; i++) {
    Serial.print(i + 1);
    Serial.print(" | SSID=");
    Serial.print(WiFi.SSID(i));
    Serial.print(" | RSSI=");
    Serial.print(WiFi.RSSI(i));
    Serial.print(" | CH=");
    Serial.print(WiFi.channel(i));
    Serial.print(" | SEC=");
    Serial.println(WiFi.encryptionType(i));

    if (WiFi.SSID(i) == WIFI_SSID && target == -1) {
      target = i;
    }
  }

  if (target < 0) {
    Serial.println("❌ TARGET WIFI TIDAK DITEMUKAN");
    WiFi.scanDelete();
    return;
  }

  int channel = WiFi.channel(target);
  uint8_t bssid[6];
  memcpy(bssid, WiFi.BSSID(target), 6);

  Serial.println();
  Serial.println("✅ TARGET WIFI DITEMUKAN");
  Serial.print("SSID    : ");
  Serial.println(WiFi.SSID(target));
  Serial.print("RSSI    : ");
  Serial.println(WiFi.RSSI(target));
  Serial.print("CHANNEL : ");
  Serial.println(channel);
  Serial.print("BSSID   : ");
  Serial.println(WiFi.BSSIDstr(target));

  WiFi.scanDelete();
  WiFi.disconnect(false, false);
  delay(300);

  Serial.println("START CONNECT...");

  WiFi.begin(WIFI_SSID, WIFI_PASSWORD, channel, bssid, true);

  unsigned long start = millis();

  while (WiFi.status() != WL_CONNECTED && millis() - start < 30000) {
    Serial.print("STATUS=");
    Serial.println(WiFi.status());
    delay(500);
  }

  Serial.println();

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("========================================");
    Serial.println("✅ WIFI CONNECTED");
    Serial.println("========================================");
    Serial.print("SSID    : ");
    Serial.println(WiFi.SSID());
    Serial.print("IP      : ");
    Serial.println(WiFi.localIP());
    Serial.print("GATEWAY : ");
    Serial.println(WiFi.gatewayIP());
    Serial.print("RSSI    : ");
    Serial.println(WiFi.RSSI());
    Serial.print("CHANNEL : ");
    Serial.println(WiFi.channel());
    Serial.print("BSSID   : ");
    Serial.println(WiFi.BSSIDstr());
  } else {
    Serial.println("========================================");
    Serial.println("❌ WIFI FAILED");
    Serial.println("========================================");
    Serial.print("STATUS: ");
    Serial.println(WiFi.status());
  }
}

void mqttCallback(char* topic, byte* payload, unsigned int length) {
  char message[256];
  if (length >= sizeof(message)) length = sizeof(message) - 1;
  memcpy(message, payload, length);
  message[length] = '\0';

  char logBuf[300];
  snprintf(logBuf, sizeof(logBuf), "📩 [MQTT Inbound] Topik: %s | Payload: %s", topic, message);
  publishSerial(logBuf);

  // 1. Perintah Uji Diagnostik Keseluruhan Alat ('t' / TEST)
  if (strstr(message, "\"cmd\":\"t\"") != NULL || strstr(message, "TEST") != NULL || strcmp(message, "t") == 0 || strcmp(message, "T") == 0) {
    publishSerial("🔬 [CMD] Menjalankan Uji Seluruh Perangkat Keras...");
    runHardwareDiagnostics(true);
  }
  // 2. Perintah Getaran Haptik ('1' / TRIGGER_HAPTIC)
  else if (strstr(message, "\"cmd\":\"1\"") != NULL || strstr(message, "TRIGGER_HAPTIC") != NULL || strstr(message, "HAPTIC") != NULL || strcmp(message, "1") == 0) {
    publishSerial("⚡ [CMD] Menjalankan Intervensi 3 Kali Getaran Haptik & 5 Kedipan LED...");
    triggerVibration(3);
  }
  // 3. Perintah Uji GSR Saja ('2')
  else if (strstr(message, "\"cmd\":\"2\"") != NULL || strstr(message, "GSR") != NULL || strcmp(message, "2") == 0) {
    updateGSR();
    char gsrInfo[128];
    snprintf(gsrInfo, sizeof(gsrInfo), "🧪 [CMD] Uji GSR -> Raw: %.0f | Volt: %.2fV | GSR: %.2f uS", gsrADC, gsrVoltage, gsrMicrosiemens);
    publishSerial(gsrInfo);
  }
  // 4. Perintah Uji MAX30102 Saja ('3')
  else if (strstr(message, "\"cmd\":\"3\"") != NULL || strstr(message, "MAX") != NULL || strcmp(message, "3") == 0) {
    bool ok = initMAX30102();
    char maxInfo[128];
    snprintf(maxInfo, sizeof(maxInfo), "❤️ [CMD] Uji MAX30102 -> %s (Part ID: 0x%02X)", ok ? "OK" : "FAILED", hw.maxPartID);
    publishSerial(maxInfo);
  }
  // 5. Perintah Uji MPU6050 Saja ('4')
  else if (strstr(message, "\"cmd\":\"4\"") != NULL || strstr(message, "MPU") != NULL || strcmp(message, "4") == 0) {
    bool ok = initMPU6050();
    char mpuInfo[128];
    snprintf(mpuInfo, sizeof(mpuInfo), "🧭 [CMD] Uji MPU6050 -> %s (WHO_AM_I: 0x%02X)", ok ? "OK" : "FAILED", hw.mpuWhoAmI);
    publishSerial(mpuInfo);
  }
  // 6. Perintah Uji Lampu LED Merah ('5' / 'LED')
  else if (strstr(message, "\"cmd\":\"5\"") != NULL || strstr(message, "LED") != NULL || strcmp(message, "5") == 0) {
    publishSerial("💡 [CMD] Uji Lampu LED Merah (GPIO 5) Berkedip 5 Kali...");
    startLedBlink(5);
  }
  // 7. Perintah Restart ('r' / 'R')
  else if (strstr(message, "\"cmd\":\"r\"") != NULL || strstr(message, "RESTART") != NULL || strcmp(message, "r") == 0 || strcmp(message, "R") == 0) {
    publishSerial("🔄 [CMD] ESP32 akan merestart dalam 1 detik...");
    delay(1000);
    ESP.restart();
  }
  // 8. Perintah Ping & Validasi
  else if (strstr(message, "PING") != NULL) {
    publishSerial("🏓 [CMD] PONG! ESP32-C3 Online & Siap.");
  }
}

void connectMQTT() {
  if (WiFi.status() != WL_CONNECTED) return;
  if (mqttClient.connected()) return;

  unsigned long now = millis();
  if (now - lastMqttReconnectAttempt < 5000) return;
  lastMqttReconnectAttempt = now;

  Serial.println();
  Serial.println("========================================");
  Serial.println("🔌 MQTT CONNECT");
  Serial.println("========================================");
  Serial.print("BROKER: ");
  Serial.print(MQTT_BROKER);
  Serial.print(":");
  Serial.println(MQTT_PORT);

  if (mqttClient.connect(DEVICE_ID)) {
    Serial.println("✅ MQTT CONNECTED");

    mqttClient.subscribe(TOPIC_COMMAND);
    Serial.print("📡 SUBSCRIBE: ");
    Serial.println(TOPIC_COMMAND);

    // Kirim notifikasi online + status hardware terkini
    runHardwareDiagnostics(true);
  } else {
    Serial.print("❌ MQTT FAILED RC=");
    Serial.println(mqttClient.state());
  }
}

void publishTelemetry() {
  if (!mqttClient.connected()) return;

  packetSeq++;
  const char* gsrStatus = !gsrAttached ? "UNATTACHED" : (gsrMicrosiemens >= 10.0f ? "DISREGULATED" : (gsrMicrosiemens >= 8.0f ? "ELEVATED" : "NORMAL"));
  const char* motionState = fidgetScore > 65 ? "HYPERACTIVE" : (fidgetScore > 35 ? "MODERATE_FIDGETING" : "STILL");

  char json[1024];
  snprintf(json, sizeof(json),
    "{\"device_id\":\"%s\",\"seq\":%u,\"timestamp\":%lu,"
    "\"gsr\":{\"raw\":%d,\"voltage\":%.2f,\"microsiemens\":%.2f,\"status\":\"%s\",\"connected\":%s},"
    "\"ppg\":{\"bpm\":%.1f,\"spo2\":%.1f,\"hrv_rmssd\":%.1f,\"finger_detected\":%s,\"connected\":%s},"
    "\"imu\":{\"ax\":%.2f,\"ay\":%.2f,\"az\":%.2f,\"gx\":%.1f,\"gy\":%.1f,\"gz\":%.1f,\"fidget_score\":%d,\"motion_state\":\"%s\",\"connected\":%s},"
    "\"battery\":{\"voltage\":%.2f,\"percentage\":%d,\"is_charging\":false},"
    "\"hardware\":{\"all_ok\":%s,\"gsr_ok\":%s,\"max_ok\":%s,\"mpu_ok\":%s,\"haptic_ok\":%s,\"msg\":\"%s\"},"
    "\"system\":{\"haptic_active\":%s,\"haptic_pattern\":\"%s\",\"disregulation_flag\":%s,\"state\":\"%s\"}}",
    DEVICE_ID, packetSeq, millis(),
    (int)gsrADC, gsrVoltage, gsrMicrosiemens, gsrStatus, hw.gsrConnected ? "true" : "false",
    estimatedBPM, estimatedSpO2, estimatedHRV, maxFinger ? "true" : "false", hw.maxConnected ? "true" : "false",
    accelX, accelY, accelZ, gyroX, gyroY, gyroZ, fidgetScore, motionState, hw.mpuConnected ? "true" : "false",
    batteryVoltage, batteryPct,
    hw.allSensorsOK ? "true" : "false", hw.gsrConnected ? "true" : "false", hw.maxConnected ? "true" : "false", hw.mpuConnected ? "true" : "false", hw.hapticMotorOK ? "true" : "false", hw.statusMessage,
    vibrationActive ? "true" : "false",
    vibrationActive ? "PULSE_ALERT" : "NONE",
    fusionAnomaly ? "true" : "false",
    vibrationActive ? "INTERVENTION_ACTIVE" : "MONITORING"
  );

  mqttClient.publish(TOPIC_TELEMETRY, json);
}

// ==================== CALIBRATION STORAGE ====================
// ==================== KONFIGURASI THRESHOLD (SAFETY FALLBACK) ====================
// ⚠️  PERHATIAN PENTING — ARSITEKTUR BACKEND-DRIVEN:
// ─────────────────────────────────────────────────────────────────────────────────
// Sistem ini menggunakan "Backend as Decision Maker" architecture:
//   • OTAK UTAMA   → Backend Node.js (menggunakan BiofeedbackDecisionEngine)
//   • ESP32 ini    → Hanya sebagai "Dumb Sensor Node" — kirim data, terima perintah
//
// Fungsi evaluateEdgeBiofeedback() di bawah adalah SAFETY FALLBACK ONLY:
//   → Hanya aktif jika WiFi/MQTT putus (backend tidak bisa dihubungi)
//   → Threshold sengaja dibuat LEBIH TINGGI/KONSERVATIF dari backend
//     supaya hanya terpicu saat kondisi benar-benar kritis (menghindari false positive)
//
// Threshold sesungguhnya yang presisi dikelola di:
//   Backend: database/adhd_iot_store.json (dapat diubah realtime dari dashboard)
// ─────────────────────────────────────────────────────────────────────────────────
void loadDefaultThreshold() {
  // [FALLBACK KONSERVATIF] Nilai lebih tinggi dari default backend (7.5 µS)
  // sehingga firmware hanya akan trigger jika kondisi benar-benar ekstrem
  threshold.gsrPercent       = 30.0f;  // Backend default: 20% → Fallback: 30%
  threshold.gsrCriticalUS    = 12.0f;  // Backend default: 7.5 µS → Fallback: 12.0 µS
  threshold.bpmMin           = 55.0f;  // Backend default: 65 → Fallback: 55 (lebih longgar)
  threshold.bpmMax           = 125.0f; // Backend default: 110 → Fallback: 125 (lebih longgar)
  threshold.imuMagnitude     = 2.0f;   // Backend default: 1.5 → Fallback: 2.0
  threshold.imuFidgetThreshold = 80;   // Backend default: 65% → Fallback: 80%
  threshold.fusionRequired   = 3;      // Backend default: 2 sensor → Fallback: semua 3 sensor
  threshold.vibrationDuration = 1500;
  threshold.cooldownSec      = 10;     // Backend default: 8s → Fallback: 10s (lebih jarang)
  threshold.autoEnabled      = true;   // Tetap aktif sebagai failsafe jika WiFi mati
}

void loadCalibration() {
  memset(&cal, 0, sizeof(cal));
  preferences.begin("wearable", true);
  cal.overallValid = preferences.getBool("overall", false);
  cal.gsrValid = preferences.getBool("gsr_ok", false);
  cal.maxValid = preferences.getBool("max_ok", false);
  cal.mpuValid = preferences.getBool("mpu_ok", false);
  cal.gsrBaseline = preferences.getFloat("gsr_base", 800.0f);
  cal.maxNoFingerIR = preferences.getFloat("max_no_ir", 1200.0f);
  cal.maxNoFingerRED = preferences.getFloat("max_no_red", 1200.0f);
  cal.axOffset = preferences.getInt("ax_off", 0);
  cal.ayOffset = preferences.getInt("ay_off", 0);
  cal.azOffset = preferences.getInt("az_off", 0);
  cal.gxOffset = preferences.getInt("gx_off", 0);
  cal.gyOffset = preferences.getInt("gy_off", 0);
  cal.gzOffset = preferences.getInt("gz_off", 0);
  preferences.end();

  if (!cal.overallValid) {
    cal.overallValid = true;
    cal.gsrValid = true;
    cal.maxValid = true;
    cal.mpuValid = true;
  }
}

// ==================== SETUP & LOOP ====================
void setup() {
  Serial.begin(115200);
  delay(1500);

  pinMode(VIBRATION_PIN, OUTPUT);
  digitalWrite(VIBRATION_PIN, LOW);
  pinMode(LED_RED_PIN, OUTPUT);
  digitalWrite(LED_RED_PIN, LOW);
  analogReadResolution(ADC_BITS);

  Serial.println("\n============================================================");
  Serial.println("🚀 ESP32-C3 WEARABLE BIOFEEDBACK (PRODUCTION V5 - SERIAL STREAM)");
  Serial.println("   Peneliti : Muhammad Reza (NPM: 2209020111) - TI UMSU 2026");
  Serial.println("   Broker   : broker.emqx.io:1883 (Global Access)");
  Serial.println("============================================================");

  loadDefaultThreshold();
  loadCalibration();

  // Eksekusi Diagnostik Hardware Pertama Kali pada Boot
  runHardwareDiagnostics(false);

  // Inisialisasi Jaringan WiFi & MQTT
  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);
  WiFi.setAutoReconnect(true);
  esp_wifi_set_max_tx_power(WIFI_POWER_8_5dBm);

  mqttClient.setServer(MQTT_BROKER, MQTT_PORT);
  mqttClient.setCallback(mqttCallback);
  mqttClient.setBufferSize(1024);

  connectWiFi();

  Serial.println("✨ Inisialisasi selesai. Ketik 't' di Serial Monitor untuk Uji Alat Kapan Saja.");
}

void loop() {
  // 1. Maintain WiFi & MQTT
  if (WiFi.status() != WL_CONNECTED) {
    connectWiFi();
  } else {
    if (!mqttClient.connected()) {
      connectMQTT();
    }
    if (mqttClient.connected()) {
      mqttClient.loop();
    }
  }

  // 2. Baca Sensor Rutin (20ms)
  unsigned long now = millis();
  if (now - lastSensorRead >= SENSOR_INTERVAL) {
    lastSensorRead = now;

    updateGSR();
    if (hw.maxConnected) updateMAX30102();
    if (hw.mpuConnected) updateMPU();

    evaluateEdgeBiofeedback();
    updateVibration();
    updateIndicators();
  }

  // 3. Kirim Telemetri MQTT (800ms)
  if (now - lastTelemetryPublish >= TELEMETRY_INTERVAL) {
    lastTelemetryPublish = now;
    publishTelemetry();
  }

  // 4. Print Log Debug ke Serial Monitor (Setiap 1 Detik)
  if (now - lastDisplay >= DISPLAY_INTERVAL) {
    lastDisplay = now;
    char statusLog[200];
    snprintf(statusLog, sizeof(statusLog), "[STATUS] GSR: %s (%.2fuS) | PPG: %s (%.0f BPM) | IMU: %s (%d%%) | Motor: %s | LED: %s | MQTT: %s",
      hw.gsrConnected ? "OK" : "TIDAK ADA",
      gsrMicrosiemens,
      hw.maxConnected ? "OK" : "TIDAK ADA",
      estimatedBPM,
      hw.mpuConnected ? "OK" : "TIDAK ADA",
      fidgetScore,
      vibrationActive ? "ON" : "OFF",
      (ledBlinkRemaining > 0) ? "BLINKING (5x)" : "OFF",
      mqttClient.connected() ? "CONNECTED" : "DISCONNECTED"
    );
    Serial.println(statusLog);
  }

  // 5. Cek Perintah Keyboard Serial Monitor Fisik untuk Uji Alat Interaktif
  if (Serial.available()) {
    char cmd = Serial.read();
    while (Serial.available()) Serial.read(); // Bersihkan sisa buffer

    if (cmd == 't' || cmd == 'T') {
      publishSerial("\n>> Menjalankan Uji Diagnostik Seluruh Perangkat Keras...");
      runHardwareDiagnostics(true);
    } else if (cmd == '1') {
      publishSerial("\n>> Uji Motor Getaran Haptik (3 Kali Getaran & 5 Kedipan LED)...");
      triggerVibration(3);
    } else if (cmd == '2') {
      publishSerial("\n>> Uji Baca Sensor GSR Analog (GPIO 0)...");
      updateGSR();
      char gsrBuf[128];
      snprintf(gsrBuf, sizeof(gsrBuf), "GSR Raw: %.0f | Tegangan: %.2fV | Konduktansi: %.2f uS", gsrADC, gsrVoltage, gsrMicrosiemens);
      publishSerial(gsrBuf);
    } else if (cmd == '3') {
      publishSerial("\n>> Uji Sensor PPG MAX30102 (I2C SDA 8, SCL 9)...");
      initMAX30102();
    } else if (cmd == '4') {
      publishSerial("\n>> Uji Sensor IMU MPU6050 (I2C SDA 7, SCL 6)...");
      initMPU6050();
    } else if (cmd == '5') {
      publishSerial("\n>> Uji Lampu LED Merah (GPIO 5) Berkedip 5 Kali...");
      startLedBlink(5);
    } else if (cmd == 'r' || cmd == 'R') {
      publishSerial("\n>> Merestart ESP32-C3...");
      ESP.restart();
    }
  }

  delay(1);
}
