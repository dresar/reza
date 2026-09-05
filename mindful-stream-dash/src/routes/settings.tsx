import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { Panel } from "@/components/Panel";
import { InfoTooltip } from "@/components/InfoTooltip";
import { api, SystemStatus } from "@/services/api";

export const Route = createFileRoute("/settings")({
  head: () => ({ meta: [{ title: "Pengaturan — ADHD Biofeedback" }] }),
  component: SettingsPage,
});

function SettingsPage() {
  const [status, setStatus] = useState<SystemStatus | null>(null);

  useEffect(() => {
    api.getStatus().then(setStatus).catch(console.error);
    const interval = setInterval(() => {
      api.getStatus().then(setStatus).catch(console.error);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="space-y-5 max-w-[1100px] mx-auto pb-8">
      <Panel
        title={
          <div className="flex items-center gap-2">
            <span>Identitas Peneliti</span>
            <InfoTooltip content="Data mahasiswa peneliti skripsi TI Fasilkom-TI UMSU Medan 2026." />
          </div>
        }
      >
        <Row k="Peneliti" v="Muhammad Reza (2209020111)" />
        <Row k="Prodi" v="Teknologi Informasi, Fasilkom-TI UMSU (2026)" />
        <Row
          k="Skripsi"
          v="Sistem Wearable IoT Biofeedback untuk Self-Awareness Anak ADHD"
        />
      </Panel>

      <Panel
        title={
          <div className="flex items-center gap-2">
            <span>Jaringan MQTT & Server</span>
            <InfoTooltip content="Konfigurasi broker MQTT Cloud publik dan port WebSocket lokal backend." />
          </div>
        }
      >
        <Row
          k="Broker MQTT"
          v={`broker.emqx.io:1883 (${status?.mqtt?.healthy ? "🟢 OK" : "STANDBY"})`}
        />
        <Row k="Topik Telemetri" v=".../esp32-band-001/telemetry" />
        <Row k="Topik Disregulasi" v=".../esp32-band-001/events" />
        <Row k="Topik Perintah" v=".../esp32-band-001/cmd" />
        <Row k="Topik Serial" v=".../esp32-band-001/serial" />
        <Row
          k="WebSocket"
          v={`ws://localhost:${status?.websocket?.port || 5001}`}
        />
      </Panel>

      <Panel
        title={
          <div className="flex items-center gap-2">
            <span>Pin Hardware ESP32-C3</span>
            <InfoTooltip content="Alokasi GPIO mikrokontroler ESP32-C3 SuperMini ke sensor dan aktuator." />
          </div>
        }
      >
        <Row k="MCU" v="ESP32-C3 SuperMini (RISC-V 160MHz)" />
        <Row k="Sensor GSR" v="GPIO 0 (ADC 12-Bit)" />
        <Row k="Motor Haptik" v="GPIO 4 (PWM / Transistor)" />
        <Row k="MAX30102 PPG" v="SDA: GPIO 8, SCL: GPIO 9" />
        <Row k="MPU6050 IMU" v="SDA: GPIO 7, SCL: GPIO 6" />
        <Row k="Baterai Li-Po" v="GPIO 2 (ADC Divider)" />
      </Panel>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex flex-col sm:flex-row justify-between sm:items-center py-2 border-b border-border/40 last:border-0 gap-1 text-xs">
      <span className="text-muted-foreground">{k}</span>
      <span className="mono font-semibold text-foreground">{v}</span>
    </div>
  );
}

