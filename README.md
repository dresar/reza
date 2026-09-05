# SISTEM WEARABLE IOT MULTISENSOR BERBASIS BIOFEEDBACK UNTUK ANAK ADHD
> **Peneliti**: Muhammad Reza (NPM: 2209020111)  
> **Institusi**: Program Studi Teknologi Informasi, Fakultas Ilmu Komputer & Teknologi Informasi (Fasilkom-TI), Universitas Muhammadiyah Sumatera Utara (UMSU Medan, 2026)  
> **Judul Skripsi**: *Perancangan Sistem Wearable IoT Multisensor Berbasis Biofeedback sebagai Media Intervensi dan Monitoring untuk Meningkatkan Self-Awareness pada Anak ADHD*

---

## 🌟 Ringkasan Sistem
Sistem ini merupakan perangkat wearable terintegrasi (gelang pintar) yang memadukan sensor fisiologis (**GSR/EDA**, **PPG MAX30102**, dan **IMU MPU6050**) dengan aktuator getaran haptik cerdas berbasis ESP32-C3 SuperMini. Data telemetri dikirim secara real-time melalui protokol MQTT ke Backend Node.js berarsitektur *Backend-as-Decision-Maker* dan divisualisasikan pada Web Dashboard Interaktif TanStack / Vite.

---

## 🛠️ Arsitektur Perangkat Keras (Hardware Pin Assignment)
- **MCU**: ESP32-C3 SuperMini (RISC-V 32-Bit @ 160MHz)
- **Sensor GSR (Respon Kulit / EDA)**: `GPIO 0` (ADC 12-Bit 0-4095)
- **Motor Vibrasi Haptik (Biofeedback)**: `GPIO 4` (Driver Transistor NPN / PWM)
- **Sensor PPG MAX30102 (Detak Jantung & SpO2)**: I2C Bus (`SDA = GPIO 8`, `SCL = GPIO 9`)
- **Sensor IMU MPU6050 (Akselerometer 6-Axis)**: I2C Bus (`SDA = GPIO 7`, `SCL = GPIO 6`)
- **Baterai Li-Po Monitoring**: `GPIO 2` (ADC Pembagi Tegangan)

---

## 🚀 Fitur Unggulan
1. **Intelligent Biofeedback Engine**: Logika fusi multisensor terpadu dengan proteksi anti-spam, adaptive cooldown (8-10s), dan pencegahan overstimulasi sensorik.
2. **Dual-Slope GSR Calibration**: Kalibrasi klinis presisi yang membedakan kondisi lepas udara (0 µS / Belum Terpasang), tangan normal (4.5 - 8.0 µS), dan kondisi basah/stres (≥ 10.0 µS).
3. **Live Multisensor Diagnostic Dashboard**: Visualisasi grafik real-time, pengukur ambang batas, log intervensi detail, serial monitor web, dan profil anak ADHD.
4. **Cloud & Local Communication**: Mendukung protokol MQTT broker (1883) dan WebSocket (5001).

---

## 💻 Panduan Menjalankan Sistem

### 1. Menjalankan Backend & Dashboard Web
```bash
# Install seluruh dependensi
npm install
npm --prefix backend install
npm --prefix mindful-stream-dash install

# Menjalankan seluruh sistem secara simultan
npm run dev
# atau klik start_system.bat
```
- Dashboard Web: `http://localhost:8080`
- Backend Server: `http://localhost:5001`
- MQTT Broker: Port `1883`

### 2. Flashing Firmware ESP32-C3
1. Buka file `firmware/ready.ino` di Arduino IDE.
2. Pilih board: `ESP32C3 Dev Module` (atau `SuperMini ESP32-C3`).
3. Hubungkan board via USB Type-C dan klik **Upload**.
