import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Activity, Zap, Play, Square, ChevronLeft, ChevronRight, Baby, ShieldCheck, HeartHandshake } from "lucide-react";
import { Panel } from "@/components/Panel";
import { ChartTooltip } from "@/components/ChartTooltip";
import { InfoTooltip } from "@/components/InfoTooltip";
import { useRealtimeStream } from "@/hooks/useRealtimeStream";
import { Button } from "@/components/ui/button";
import { api } from "@/services/api";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";

export const Route = createFileRoute("/live")({
  head: () => ({ meta: [{ title: "Live Monitor — ADHD Biofeedback" }] }),
  component: LiveMonitor,
});

function LiveMonitor() {
  const { isTherapist, isParent, linkedPatient } = useAuth();
  const {
    isConnected,
    series,
    latest,
    alerts,
    hapticActive,
    mqttConnected,
    activeSession,
    triggerHaptic,
    startSession,
    stopSession,
  } = useRealtimeStream();

  const [mounted, setMounted] = useState(false);
  const [alertPage, setAlertPage] = useState(1);
  const ALERTS_PER_PAGE = 4;

  useEffect(() => {
    setMounted(true);
  }, []);

  // Deteksi status online perangkat hardware ESP32-C3
  const isDeviceOnline = isConnected && (mqttConnected || latest.bpm > 0 || latest.gsr > 0 || (latest.state && latest.state !== "OFFLINE"));

  const handleToggleSession = async () => {
    if (activeSession) {
      await stopSession(activeSession.id || "");
      toast.success("Sesi observasi berhasil dihentikan.");
    } else {
      if (!isDeviceOnline) {
        toast.error("Alat Gelang ESP32 sedang offline. Nyalakan perangkat gelang terlebih dahulu!");
        return;
      }
      const childId = linkedPatient?.id || "patient-1786778779697";
      const childName = linkedPatient?.name || "Muhammad Reza";
      await startSession(childId, `Sesi Monitoring & Terapi (${childName})`);
      toast.success(`Sesi observasi dimulai untuk ${childName}!`);
    }
  };

  const totalAlertPages = Math.max(1, Math.ceil(alerts.length / ALERTS_PER_PAGE));
  const pagedAlerts = alerts.slice((alertPage - 1) * ALERTS_PER_PAGE, alertPage * ALERTS_PER_PAGE);

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto pb-8">
      {/* Top Banner & Control Bar */}
      <div className="p-3.5 md:p-4 rounded-2xl bg-[#0B0F1E] border border-[#1E293B] shadow-lg flex flex-col xl:flex-row items-start xl:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="relative h-10 w-10 rounded-xl bg-[#00D4FF]/10 border border-[#00D4FF]/30 flex items-center justify-center shrink-0">
            <span
              className="absolute inset-0 rounded-xl animate-ping opacity-30"
              style={{ background: isDeviceOnline ? "#10B981" : "#F43F5E" }}
            />
            <Activity className="h-5 w-5 relative" style={{ color: isDeviceOnline ? "#10B981" : "#F43F5E" }} />
          </div>

          <div className="space-y-0.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-sm text-white">
                {isParent ? `Pemantauan Live Ananda ${linkedPatient?.name || "Muhammad Reza"}` : "ESP32-C3 Biofeedback Live Monitor"}
              </span>
              <InfoTooltip content="Pemantauan live sinyal fisiologis anak (GSR, Denyut Nadi, Gerak) & respon getaran secara real-time." />
              {isDeviceOnline ? (
                <span className="px-2 py-0.2 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                  🟢 ALAT ONLINE
                </span>
              ) : (
                <span className="px-2 py-0.2 rounded-full text-[10px] font-bold bg-rose-500/15 text-rose-400 border border-rose-500/30">
                  🔴 ALAT OFFLINE
                </span>
              )}
            </div>
            <div className="text-[11px] text-slate-400 font-mono">
              {isParent ? (
                <span>Status Sesi: <strong className={activeSession ? "text-emerald-400 font-bold" : "text-slate-400"}>{activeSession ? "🟢 Sesi Terapi Aktif" : "Menunggu Sesi Terapi"}</strong></span>
              ) : (
                <span>ID Perangkat: <code className="text-cyan-300 font-bold">esp32-band-001</code> · Status Sesi: <strong className={activeSession ? "text-emerald-400" : "text-slate-400"}>{activeSession ? "🟢 AKTIF" : "STANDBY"}</strong></span>
              )}
            </div>
          </div>
        </div>

        {/* Action controls: Khusus Terapis / Read-only untuk Orang Tua */}
        {isTherapist ? (
          <div className="flex items-center gap-2 flex-wrap w-full xl:w-auto justify-start xl:justify-end">
            <Button
              size="sm"
              disabled={!isDeviceOnline}
              onClick={() => {
                api.testHardware("HAPTIC_SHORT", 500);
                toast.success("⚡ Uji Getar 500ms!");
              }}
              className="h-8 px-2.5 text-[11px] font-semibold bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 border border-cyan-500/40 disabled:opacity-40"
            >
              <Zap className="h-3 w-3 mr-1 text-cyan-400" />
              500ms
            </Button>

            <Button
              size="sm"
              disabled={!isDeviceOnline}
              onClick={() => {
                api.testHardware("HAPTIC_MEDIUM", 1500);
                toast.success("⚡ Uji Getar 1.5s!");
              }}
              className="h-8 px-2.5 text-[11px] font-semibold bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/40 disabled:opacity-40"
            >
              <Zap className="h-3 w-3 mr-1 text-amber-400" />
              1.5s
            </Button>

            <Button
              size="sm"
              disabled={!isDeviceOnline}
              onClick={() => {
                api.testHardware("HAPTIC_STRONG", 2500);
                toast.success("⚡ Uji Getar 2.5s!");
              }}
              className="h-8 px-2.5 text-[11px] font-semibold bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/40 disabled:opacity-40"
            >
              <Zap className="h-3 w-3 mr-1 text-rose-400" />
              2.5s
            </Button>

            <Button
              size="sm"
              onClick={handleToggleSession}
              disabled={!activeSession && !isDeviceOnline}
              className={`h-8 px-3 text-xs font-semibold ${
                activeSession
                  ? "bg-rose-500/20 text-rose-300 hover:bg-rose-500/30 border border-rose-500/50 shadow-[0_0_15px_rgba(244,63,94,0.3)]"
                  : "bg-[#00D4FF]/20 text-[#00D4FF] hover:bg-[#00D4FF]/30 border border-[#00D4FF]/50 disabled:opacity-40 disabled:cursor-not-allowed"
              }`}
              title={!activeSession && !isDeviceOnline ? "Alat sedang offline. Tidak dapat memulai sesi." : ""}
            >
              {activeSession ? (
                <>
                  <Square className="h-3.5 w-3.5 mr-1.5 text-rose-400" />
                  Stop Sesi
                </>
              ) : (
                <>
                  <Play className="h-3.5 w-3.5 mr-1.5 text-[#00D4FF]" />
                  {isDeviceOnline ? "Mulai Sesi" : "Alat Offline"}
                </>
              )}
            </Button>
          </div>
        ) : (
          /* Tampilan Status Khusus Orang Tua (Bersih, Ramah, Tanpa Tombol Teknis) */
          <div className="flex items-center gap-2.5 bg-slate-900/90 px-3.5 py-2 rounded-xl border border-emerald-500/30">
            <HeartHandshake className="h-4 w-4 text-emerald-400" />
            <div className="text-xs">
              <span className="text-slate-400">Mode Akses: </span>
              <span className="font-bold text-emerald-300">Orang Tua (Hanya Pantau)</span>
            </div>
          </div>
        )}
      </div>

      {/* Main Charts & Side Panels */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        <div className="xl:col-span-8 space-y-5">
          {/* GSR Waveform */}
          {/* GSR Waveform */}
          <LiveAreaChart
            title="Konduktansi Kulit (GSR)"
            subtitle="Galvanic Skin Response (μS)"
            info="Respon aktivitas saraf simpatis anak. Nilai normal saat menempel: 1.0 - 5.0 μS. Jika belum menempel, status akan otomatis menampilkan BELUM TERPASANG."
            data={series}
            dataKey="gsr"
            strokeColor="#00D4FF"
            fillGradient="gsrGrad"
            unit="μS"
            current={
              !isConnected
                ? "--"
                : latest.gsr >= 18.0 || latest.gsr <= 0.05
                ? "--"
                : latest.gsr.toFixed(2)
            }
            badge={
              !isConnected
                ? "OFFLINE"
                : latest.gsr >= 18.0 || latest.gsr <= 0.05
                ? "BELUM TERPASANG"
                : latest.gsr > 7.5
                ? "KRITIS (DISREGULASI)"
                : latest.gsr > 5.5
                ? "WASPADA (ELEVATED)"
                : "NORMAL (RELAKS)"
            }
            badgeClass={
              !isConnected
                ? "bg-slate-800 text-slate-500 border-slate-700"
                : latest.gsr >= 18.0 || latest.gsr <= 0.05
                ? "bg-slate-800/90 text-amber-300 border-amber-500/40"
                : latest.gsr > 7.5
                ? "bg-rose-500/20 text-rose-400 border-rose-500/50 animate-pulse"
                : latest.gsr > 5.5
                ? "bg-amber-500/20 text-amber-400 border-amber-500/50"
                : "bg-cyan-500/20 text-cyan-400 border-cyan-500/30"
            }
            mounted={mounted}
          />

          {/* PPG Waveform */}
          <LiveAreaChart
            title="Detak Jantung (PPG MAX30102)"
            subtitle="Photoplethysmography (BPM)"
            info="Pengukuran detak jantung kardiovaskular secara optik. Denyut > 115 BPM menandakan takikardia saat anak mengalami tekanan."
            data={series}
            dataKey="bpm"
            strokeColor="#F43F5E"
            fillGradient="ppgGrad"
            unit="BPM"
            current={latest.bpm > 0 ? `${Math.round(latest.bpm)}` : isConnected ? "--" : "--"}
            badge={
              !isConnected
                ? "OFFLINE"
                : latest.bpm > 0
                ? `SpO2 ${latest.spo2.toFixed(0)}%`
                : "BELUM MENEMPEL"
            }
            badgeClass={
              !isConnected
                ? "bg-slate-800 text-slate-500 border-slate-700"
                : latest.bpm > 0
                ? "bg-rose-500/20 text-rose-400 border-rose-500/40"
                : "bg-slate-800/80 text-slate-400 border-slate-700"
            }
            mounted={mounted}
          />

          {/* IMU Motion Waveform */}
          <LiveAreaChart
            title="Indeks Gerak (IMU MPU6050)"
            subtitle="Fidgeting & Akselerasi (%)"
            info="Akselerometer 3-axis untuk mengukur skor fidgeting motorik (0-100%). Nilai > 65% menandakan hiperaktivitas tinggi."
            data={series}
            dataKey="motion"
            strokeColor="#F59E0B"
            fillGradient="imuGrad"
            unit="%"
            current={isConnected ? `${latest.motion}%` : "--"}
            badge={!isConnected ? "OFFLINE" : latest.motion > 65 ? "HIPERAKTIF" : latest.motion > 35 ? "GELISAH" : "TENANG"}
            badgeClass={
              !isConnected
                ? "bg-slate-800 text-slate-500 border-slate-700"
                : latest.motion > 65
                ? "bg-amber-500/20 text-amber-400 border-amber-500/50 animate-pulse"
                : latest.motion > 35
                ? "bg-amber-500/20 text-amber-400 border-amber-500/30"
                : "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
            }
            mounted={mounted}
          />
        </div>

        {/* Side Panel: Alerts & Biofeedback status */}
        <div className="xl:col-span-4 space-y-5">
          {/* Biofeedback Trigger Card */}
          <div
            className={`p-4 rounded-2xl border transition-all duration-300 ${
              hapticActive
                ? "bg-rose-500/15 border-rose-500 shadow-[0_0_30px_rgba(244,63,94,0.3)] animate-pulse"
                : "bg-[#0B0F1E] border-[#1E293B]"
            }`}
          >
            <div className="flex items-center gap-3">
              <div
                className={`h-9 w-9 rounded-xl flex items-center justify-center ${
                  hapticActive ? "bg-rose-500 text-white" : "bg-slate-800 text-slate-400"
                }`}
              >
                <Zap className="h-4 w-4" />
              </div>
              <div>
                <div className="font-bold text-xs text-white">
                  {hapticActive ? "⚡ HAPTIC ACTIVE" : "Status Biofeedback"}
                </div>
                <div className="text-[11px] text-slate-400">
                  {hapticActive
                    ? "Getaran aktif di pergelangan tangan."
                    : "Kondisi parameter stabil."}
                </div>
              </div>
            </div>
          </div>

          {/* Live Trigger Diagnostic Evaluator */}
          <Panel
            title={
              <div className="flex items-center justify-between w-full">
                <div className="flex items-center gap-2">
                  <Activity className="h-4 w-4 text-cyan-400" />
                  <span className="text-sm font-bold text-white">Diagnostik Pemicu Realtime</span>
                </div>
                <span className="text-[10px] font-mono text-slate-400">AMBANG BATAS</span>
              </div>
            }
          >
            <div className="space-y-3.5 text-xs">
              {/* 1. GSR Gauge Bar */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-slate-300 font-medium flex items-center gap-1.5">
                    💧 Respon Kulit (GSR)
                  </span>
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono font-bold text-cyan-300">
                      {latest.gsr > 0.05 ? `${latest.gsr.toFixed(2)} μS` : "--"}
                    </span>
                    <span className={`px-1.5 py-0.2 rounded text-[9px] font-bold uppercase border ${
                      latest.gsr >= 10.0
                        ? "bg-rose-500/20 text-rose-400 border-rose-500/40 animate-pulse"
                        : latest.gsr >= 8.0
                        ? "bg-amber-500/20 text-amber-400 border-amber-500/30"
                        : "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                    }`}>
                      {latest.gsr <= 0.05 ? "LEPAS" : latest.gsr >= 10.0 ? "KRITIS (≥10)" : latest.gsr >= 8.0 ? "WASPADA" : "NORMAL"}
                    </span>
                  </div>
                </div>
                <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden relative">
                  <div
                    className={`h-full transition-all duration-300 ${
                      latest.gsr >= 10.0 ? "bg-rose-500" : latest.gsr >= 8.0 ? "bg-amber-500" : "bg-cyan-500"
                    }`}
                    style={{ width: `${Math.min(100, Math.max(0, (latest.gsr / 12) * 100))}%` }}
                  />
                  {/* Threshold marker at 10.0 uS (~83%) */}
                  <div className="absolute top-0 bottom-0 left-[83.3%] w-0.5 bg-rose-400 shadow-[0_0_6px_#f43f5e]" title="Batas Kritis 10.0 μS" />
                </div>
                <div className="flex justify-between text-[10px] text-slate-500 mt-0.5 font-mono">
                  <span>0 μS</span>
                  <span className="text-rose-400 font-semibold">Batas: 10.0 μS</span>
                  <span>12 μS</span>
                </div>
              </div>

              {/* 2. BPM Gauge Bar */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-slate-300 font-medium flex items-center gap-1.5">
                    ❤️ Detak Jantung (PPG)
                  </span>
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono font-bold text-rose-300">
                      {latest.bpm > 0 ? `${Math.round(latest.bpm)} BPM` : "--"}
                    </span>
                    <span className={`px-1.5 py-0.2 rounded text-[9px] font-bold uppercase border ${
                      latest.bpm > 115
                        ? "bg-rose-500/20 text-rose-400 border-rose-500/40 animate-pulse"
                        : "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                    }`}>
                      {latest.bpm === 0 ? "OFF" : latest.bpm > 115 ? "TINGGI (>115)" : "NORMAL"}
                    </span>
                  </div>
                </div>
                <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden relative">
                  <div
                    className={`h-full transition-all duration-300 ${
                      latest.bpm > 115 ? "bg-rose-500" : "bg-emerald-500"
                    }`}
                    style={{ width: `${Math.min(100, Math.max(0, (latest.bpm / 160) * 100))}%` }}
                  />
                  {/* Threshold marker at 115 BPM (~71.8%) */}
                  <div className="absolute top-0 bottom-0 left-[71.8%] w-0.5 bg-rose-400 shadow-[0_0_6px_#f43f5e]" title="Batas Kritis 115 BPM" />
                </div>
                <div className="flex justify-between text-[10px] text-slate-500 mt-0.5 font-mono">
                  <span>40 BPM</span>
                  <span className="text-rose-400 font-semibold">Batas: 115 BPM</span>
                  <span>160 BPM</span>
                </div>
              </div>

              {/* 3. IMU Motion Bar */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-slate-300 font-medium flex items-center gap-1.5">
                    🏃 Kegelisahan Gerak (IMU)
                  </span>
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono font-bold text-amber-300">
                      {latest.motion > 0 ? `${latest.motion}%` : "--"}
                    </span>
                    <span className={`px-1.5 py-0.2 rounded text-[9px] font-bold uppercase border ${
                      latest.motion >= 75
                        ? "bg-rose-500/20 text-rose-400 border-rose-500/40 animate-pulse"
                        : latest.motion > 40
                        ? "bg-amber-500/20 text-amber-400 border-amber-500/30"
                        : "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                    }`}>
                      {latest.motion >= 75 ? "HIPERAKTIF (≥75%)" : latest.motion > 40 ? "GELISAH" : "TENANG"}
                    </span>
                  </div>
                </div>
                <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden relative">
                  <div
                    className={`h-full transition-all duration-300 ${
                      latest.motion >= 75 ? "bg-rose-500" : latest.motion > 40 ? "bg-amber-500" : "bg-emerald-500"
                    }`}
                    style={{ width: `${Math.min(100, Math.max(0, latest.motion))}%` }}
                  />
                  {/* Threshold marker at 75% */}
                  <div className="absolute top-0 bottom-0 left-[75%] w-0.5 bg-rose-400 shadow-[0_0_6px_#f43f5e]" title="Batas Kritis 75%" />
                </div>
                <div className="flex justify-between text-[10px] text-slate-500 mt-0.5 font-mono">
                  <span>0%</span>
                  <span className="text-rose-400 font-semibold">Batas: 75%</span>
                  <span>100%</span>
                </div>
              </div>
            </div>
          </Panel>

          {/* Real-time Notification Log with Detailed Diagnostics */}
          <Panel
            title={
              <div className="flex items-center justify-between w-full">
                <div className="flex items-center gap-2">
                  <Zap className="h-4 w-4 text-amber-400" />
                  <span className="text-sm font-bold text-white">Log Intervensi & Pemicu</span>
                </div>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-slate-800 text-slate-300 border border-slate-700">
                  {alerts.length} Kejadian
                </span>
              </div>
            }
          >
            <div className="space-y-2.5">
              {pagedAlerts.length === 0 ? (
                <div className="py-6 text-center text-xs text-slate-500">
                  Belum ada intervensi haptik yang terpicu. Kondisi ananda dalam batas normal.
                </div>
              ) : (
                pagedAlerts.map((a, idx) => (
                  <div
                    key={`alert-${a.id || idx}`}
                    className="p-3 rounded-xl border border-amber-500/30 bg-slate-900/80 space-y-2 text-xs hover:border-amber-500/60 transition-all shadow-md"
                  >
                    <div className="flex justify-between items-center flex-wrap gap-2 border-b border-slate-800 pb-1.5">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
                        <span className="font-mono text-xs text-slate-300 font-bold">{a.ts}</span>
                      </div>
                      <span className="px-2 py-0.5 rounded text-[9px] font-bold uppercase bg-amber-500/20 text-amber-300 border border-amber-500/40">
                        {a.type || "Biofeedback"}
                      </span>
                    </div>

                    {/* Sensor Snapshot Chips */}
                    {a.metrics && (
                      <div className="flex items-center gap-1.5 flex-wrap font-mono text-[10px]">
                        <span className="px-2 py-0.5 rounded bg-cyan-950/80 border border-cyan-500/30 text-cyan-300">
                          💧 GSR: {a.metrics.gsr_us?.toFixed(1) || "--"} μS
                        </span>
                        <span className="px-2 py-0.5 rounded bg-rose-950/80 border border-rose-500/30 text-rose-300">
                          ❤️ BPM: {Math.round(a.metrics.bpm || 0)}
                        </span>
                        <span className="px-2 py-0.5 rounded bg-amber-950/80 border border-amber-500/30 text-amber-300">
                          🏃 IMU: {a.metrics.fidget_score || 0}%
                        </span>
                      </div>
                    )}

                    {/* Full Diagnostic Message (No Cutoff) */}
                    <div className="text-slate-300 text-[11px] leading-relaxed break-words bg-slate-950/60 p-2 rounded-lg border border-slate-800/80">
                      {a.msg}
                    </div>
                  </div>
                ))
              )}

              {alerts.length > ALERTS_PER_PAGE && (
                <div className="flex items-center justify-between pt-2 border-t border-slate-800 text-[11px] text-slate-400">
                  <span>Hal {alertPage}/{totalAlertPages} ({alerts.length} Total)</span>
                  <div className="flex gap-1">
                    <button
                      onClick={() => setAlertPage(p => Math.max(1, p - 1))}
                      disabled={alertPage === 1}
                      className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-30"
                    >
                      <ChevronLeft className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => setAlertPage(p => Math.min(totalAlertPages, p + 1))}
                      disabled={alertPage === totalAlertPages}
                      className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-30"
                    >
                      <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </Panel>

          {/* Hardware Status */}
          <Panel
            title={
              <div className="flex items-center gap-2">
                <span>Status Perangkat</span>
                <InfoTooltip content="Status koneksi modul hardware ESP32-C3, sensor fisiologis (I2C/ADC), motor getar haptik, dan persentase baterai Li-Po." />
              </div>
            }
          >
            <div className="space-y-2.5 text-xs">
              <SensorRow label="ESP32-C3 MCU" ok={isConnected} val={isConnected ? "Online" : "Offline"} />
              <SensorRow label="GSR (GPIO 0)" ok={latest.gsr > 0} val={latest.gsr > 0 ? `${latest.gsr.toFixed(2)} μS` : "--"} />
              <SensorRow label="MAX30102 PPG" ok={latest.bpm > 0} val={latest.bpm > 0 ? `${Math.round(latest.bpm)} BPM` : "--"} />
              <SensorRow label="MPU6050 IMU" ok={latest.motion > 0} val={latest.motion > 0 ? `${latest.motion}%` : "--"} />
              <SensorRow
                label="Motor Haptik"
                tone={hapticActive ? "amber" : "emerald"}
                val={hapticActive ? "AKTIF" : "STANDBY"}
              />
              <div className="pt-2 border-t border-[#1E293B] flex justify-between items-center text-slate-400 font-mono text-[11px]">
                <span>Baterai:</span>
                <span className="text-white font-bold">
                  {latest.batteryVolt > 0 ? `${latest.batteryVolt.toFixed(2)}V (${latest.batteryPct}%)` : "--"}
                </span>
              </div>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}

function LiveAreaChart({
  title,
  subtitle,
  info,
  data,
  dataKey,
  strokeColor,
  fillGradient,
  unit,
  current,
  badge,
  badgeClass,
  mounted,
}: {
  title: string;
  subtitle: string;
  info?: string;
  data: any[];
  dataKey: string;
  strokeColor: string;
  fillGradient: string;
  unit: string;
  current: any;
  badge?: string;
  badgeClass?: string;
  mounted: boolean;
}) {
  return (
    <div className="p-4 md:p-5 rounded-2xl bg-[#0B0F1E] border border-[#1E293B] shadow-md space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <div className="flex items-center gap-1.5">
            <h3 className="font-bold text-xs text-white tracking-tight">{title}</h3>
            {info && <InfoTooltip content={info} title={title} />}
          </div>
          <p className="text-[10px] text-slate-400">{subtitle}</p>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto">
          {badge && (
            <span className={`px-2 py-0.5 rounded text-[9px] font-bold border font-mono ${badgeClass}`}>
              {badge}
            </span>
          )}
          <span className="font-mono text-sm font-bold" style={{ color: strokeColor }}>
            {current} {unit}
          </span>
        </div>
      </div>

      <div style={{ height: 145 }}>
        {mounted && data && data.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id={fillGradient} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={strokeColor} stopOpacity={0.35} />
                  <stop offset="95%" stopColor={strokeColor} stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#1E293B" strokeDasharray="3 6" vertical={false} />
              <XAxis
                dataKey="timeStr"
                stroke="#64748B"
                fontSize={10}
                fontFamily="Space Mono"
                interval={4}
                minTickGap={35}
              />
              <YAxis stroke="#64748B" fontSize={10} fontFamily="Space Mono" domain={["auto", "auto"]} />
              <Tooltip content={<ChartTooltip />} cursor={{ stroke: strokeColor, strokeOpacity: 0.3 }} />
              <Area
                type="monotone"
                dataKey={dataKey}
                stroke={strokeColor}
                strokeWidth={2.2}
                fill={`url(#${fillGradient})`}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-xs text-slate-500 space-y-0.5">
            <span>Alat Belum Aktif / Sinyal Sensor Kosong</span>
            <span className="text-[10px] text-slate-600">Grafik akan mulai bergulir otomatis saat telemetri diterima</span>
          </div>
        )}
      </div>
    </div>
  );
}

function SensorRow({
  label,
  ok,
  tone = "emerald",
  val,
}: {
  label: string;
  ok?: boolean;
  tone?: "emerald" | "amber";
  val: string;
}) {
  const c = ok ? (tone === "amber" ? "#F59E0B" : "#10B981") : "#F43F5E";
  return (
    <div className="flex items-center justify-between py-1 border-b border-[#1E293B]/60 last:border-0">
      <div className="flex items-center gap-2">
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: c, boxShadow: `0 0 6px ${c}` }} />
        <span className="text-slate-300">{label}</span>
      </div>
      <span className="font-mono text-[11px] font-bold text-slate-200">{val}</span>
    </div>
  );
}
