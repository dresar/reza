import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useMemo } from "react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Legend,
} from "recharts";
import {
  AlertTriangle, Zap, Download, Plus, Activity, ChevronLeft, ChevronRight, CheckCircle2,
} from "lucide-react";
import { Panel } from "@/components/Panel";
import { ChartTooltip } from "@/components/ChartTooltip";
import { InfoTooltip } from "@/components/InfoTooltip";
import { useRealtimeStream } from "@/hooks/useRealtimeStream";
import { api, Patient, AlertEvent } from "@/services/api";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dashboard — ADHD Biofeedback" },
      { name: "description", content: "Real-time biofeedback dashboard for ADHD." },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const { isConnected, latest, series, alerts, mqttConnected, activeSession } = useRealtimeStream();
  const { user, isParent, linkedPatient } = useAuth();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [dbAlerts, setDbAlerts] = useState<AlertEvent[]>([]);
  const [sessionSec, setSessionSec] = useState(0);
  const [mounted, setMounted] = useState(false);

  // Pagination for logs
  const [alertPage, setAlertPage] = useState(1);
  const ALERTS_PER_PAGE = 4;

  useEffect(() => {
    setMounted(true);
    api.getPatients().then((p) => setPatients(p || [])).catch(() => setPatients([]));
    api.getAlerts().then((a) => setDbAlerts(a || [])).catch(() => setDbAlerts([]));
  }, []);

  useEffect(() => {
    let id: NodeJS.Timeout;
    if (activeSession) {
      id = setInterval(() => setSessionSec((s) => s + 1), 1000);
    } else {
      setSessionSec(0);
    }
    return () => clearInterval(id);
  }, [activeSession]);

  const sessionStr = useMemo(() => {
    const h = Math.floor(sessionSec / 3600);
    const m = Math.floor((sessionSec % 3600) / 60);
    const s = sessionSec % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }, [sessionSec]);

  const activePatient = patients[0] || null;
  const isDeviceOnline = isConnected && latest.gsr > 0;
  const focusIndex = useMemo(() => {
    if (!isConnected || (latest.gsr === 0 && latest.bpm === 0)) return 0;
    const isGsrAttached = latest.gsr > 0.05;
    const gsrPenalty = isGsrAttached && latest.gsr >= 10.0 ? 40 : isGsrAttached && latest.gsr >= 8.0 ? 20 : 0;
    const fidgetPenalty = latest.motion * 0.4;
    return Math.max(10, Math.min(100, Math.round(100 - (gsrPenalty + fidgetPenalty))));
  }, [isConnected, latest.gsr, latest.bpm, latest.motion]);

  const allAlerts = alerts.length > 0 ? alerts : dbAlerts.map(a => ({
    id: a.id,
    ts: new Date(a.timestamp).toLocaleTimeString("id-ID"),
    msg: a.trigger_reason,
    severity: a.severity,
  }));

  const totalPages = Math.max(1, Math.ceil(allAlerts.length / ALERTS_PER_PAGE));
  const pagedAlerts = allAlerts.slice((alertPage - 1) * ALERTS_PER_PAGE, alertPage * ALERTS_PER_PAGE);

  const parentFriendlyState = useMemo(() => {
    if (!isConnected) {
      return {
        title: "Perangkat Standby",
        desc: "Gelang sedang tidak terhubung atau menunggu sesi dimulai.",
        color: "slate",
        badge: "OFFLINE",
        icon: "💤"
      };
    }
    if (latest.haptic_active) {
      return {
        title: "Biofeedback Aktif",
        desc: "Gelang sedang bergetar lembut di pergelangan tangan untuk menarik fokus dan kesadaran diri anak.",
        color: "rose",
        badge: "STIMULUS AKTIF",
        icon: "⚡"
      };
    }
    const isGsrAttached = latest.gsr > 0.05;
    if ((isGsrAttached && latest.gsr >= 10.0) || latest.fidget > 75) {
      return {
        title: "Indikasi Disregulasi",
        desc: "Terdeteksi lonjakan aktivitas fisiologis atau kegelisahan tinggi. Disarankan mengajak anak minum air atau bernapas tenang.",
        color: "amber",
        badge: "PERLU PENDAMPINGAN",
        icon: "⚠️"
      };
    }
    if ((isGsrAttached && latest.gsr >= 8.0) || latest.fidget > 40) {
      return {
        title: "Peningkatan Aktivitas",
        desc: "Ananda sedang aktif bergerak (fidgeting ringan). Kondisi masih dalam batas adaptasi normal.",
        color: "blue",
        badge: "AKTIF BERGERAK",
        icon: "🏃"
      };
    }
    return {
      title: "Normal (Tenang & Rileks)",
      desc: "Kondisi respon fisiologis dan motorik ananda stabil dalam rentang istirahat.",
      color: "emerald",
      badge: "KONDISI BAIK",
      icon: "✨"
    };
  }, [isConnected, latest.haptic_active, latest.gsr, latest.fidget]);

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto pb-8">
      {/* MODE ORANG TUA: Kartu Status Ramah Keluarga */}
      {isParent && (
        <div className="p-5 rounded-2xl bg-gradient-to-r from-slate-900 via-[#0C1428] to-slate-900 border border-emerald-500/30 shadow-xl space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2.5">
              <span className="text-2xl">{parentFriendlyState.icon}</span>
              <div>
                <div className="text-xs text-slate-400 font-medium">Status Pemantauan Ananda:</div>
                <div className="text-base font-bold text-white">
                  {linkedPatient?.name || "Muhammad Reza"} ({linkedPatient?.age || 8} Tahun)
                </div>
              </div>
            </div>
            <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-${parentFriendlyState.color}-500/20 text-${parentFriendlyState.color}-400 border border-${parentFriendlyState.color}-500/40`}>
              {parentFriendlyState.badge}
            </span>
          </div>

          <div className="text-sm text-slate-300">
            <p className="font-semibold text-white mb-0.5">{parentFriendlyState.title}</p>
            <p className="text-xs text-slate-400 leading-relaxed">{parentFriendlyState.desc}</p>
          </div>
        </div>
      )}

      {/* Top Banner & Online Indicators */}
      <div className="flex items-center justify-between flex-wrap gap-4 bg-slate-900/60 p-4 rounded-xl border border-slate-800">
        <div className="flex items-center gap-3">
          <Activity className="h-5 w-5 text-cyan-400" />
          <div>
            <h2 className="text-base font-bold text-white">
              {isParent ? `Pemantauan Ananda ${linkedPatient?.name || "Muhammad Reza"}` : "Overview Sistem ADHD Biofeedback"}
            </h2>
            <p className="text-xs text-slate-400">
              {isParent
                ? "Pantau kondisi detak jantung, ketenangan emosi, dan gerak ananda secara langsung."
                : "Monitoring multisensorik terintegrasi real-time via MQTT (1883) & WebSocket (5001)."}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${isDeviceOnline ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" : "bg-rose-500/15 text-rose-400 border-rose-500/30"}`}>
            ESP32: {isDeviceOnline ? "ONLINE" : "STANDBY"}
          </span>
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${mqttConnected ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" : "bg-slate-800 text-slate-400 border-slate-700"}`}>
            MQTT: {mqttConnected ? "OK" : "OFF"}
          </span>
          <span className="px-2 py-0.5 rounded-full text-[10px] font-mono text-cyan-400 bg-cyan-500/10 border border-cyan-500/30">
            WS: 5001
          </span>
        </div>
      </div>

      {/* Real Metric Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <MetricCard
          title="Detak Jantung"
          subtitle="PPG MAX30102"
          info="Sensor optik MAX30102 untuk mendeteksi denyut nadi anak. Kenaikan tajam (takikardia) menandakan respon stres simpatis."
          value={latest.bpm > 0 ? `${Math.round(latest.bpm)}` : "--"}
          unit="BPM"
          color="#F43F5E"
          badge={!isConnected ? "OFFLINE" : latest.bpm > 115 ? "TINGGI" : latest.bpm > 0 ? "NORMAL" : "BELUM MENEMPEL"}
          badgeClass={
            !isConnected
              ? "bg-slate-800 text-slate-500 border-slate-700"
              : latest.bpm > 115
              ? "bg-rose-500/20 text-rose-400 border-rose-500/50"
              : latest.bpm > 0
              ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
              : "bg-slate-800/80 text-slate-400 border-slate-700"
          }
        />

        <MetricCard
          title="Respon Kulit"
          subtitle="GSR Sensor"
          info="Galvanic Skin Response (μS). Mengukur lonjakan konduktansi keringat mikro akibat disregulasi emosi atau hiperaktivitas."
          value={
            !isConnected || latest.gsr <= 0.05
              ? "--"
              : `${latest.gsr.toFixed(2)}`
          }
          unit="μS"
          color="#00D4FF"
          badge={
            !isConnected
              ? "OFFLINE"
              : latest.gsr <= 0.05
              ? "BELUM TERPASANG"
              : latest.gsr > 7.5
              ? "KRITIS"
              : latest.gsr > 5.5
              ? "WASPADA"
              : "NORMAL"
          }
          badgeClass={
            !isConnected
              ? "bg-slate-800 text-slate-500 border-slate-700"
              : latest.gsr <= 0.05
              ? "bg-slate-800/90 text-amber-300 border-amber-500/40"
              : latest.gsr > 7.5
              ? "bg-rose-500/20 text-rose-400 border-rose-500/50 animate-pulse"
              : latest.gsr > 5.5
              ? "bg-amber-500/20 text-amber-400 border-amber-500/40"
              : "bg-cyan-500/20 text-cyan-400 border-cyan-500/30"
          }
        />

        <MetricCard
          title="Indeks Gerak"
          subtitle="IMU MPU6050"
          info="Skor fidgeting motorik dari sensor akselerometer 6-axis MPU6050 untuk mendeteksi kegelisahan gerak anak ADHD."
          value={isConnected ? `${latest.motion}` : "--"}
          unit="%"
          color="#F59E0B"
          badge={!isConnected ? "OFFLINE" : latest.motion > 65 ? "HIPERAKTIF" : latest.motion > 35 ? "GELISAH" : "TENANG"}
          badgeClass={
            !isConnected
              ? "bg-slate-800 text-slate-500 border-slate-700"
              : latest.motion > 65
              ? "bg-amber-500/20 text-amber-400 border-amber-500/50"
              : latest.motion > 35
              ? "bg-amber-500/20 text-amber-400 border-amber-500/30"
              : "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
          }
        />

        <MetricCard
          title="Getaran Haptik"
          subtitle="Biofeedback"
          info="Total frekuensi pemicuan motor getar haptik sebagai media intervensi pengingat fokus ke pergelangan tangan anak."
          value={`${allAlerts.length}`}
          unit="KALI"
          color="#A78BFA"
          badge={allAlerts.length > 0 ? "AKTIF" : "NIHIL"}
          badgeClass="bg-purple-500/20 text-purple-400 border-purple-500/30"
        />
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        <div className="xl:col-span-8 space-y-6">
          <div className="p-5 rounded-2xl bg-[#0B0F1E] border border-[#1E293B] shadow-md space-y-4">
            <div className="flex flex-row items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-sm text-white">Waveform GSR & PPG</h3>
                <InfoTooltip content="Grafik real-time telemetri sinyal konduktansi kulit GSR (μS) dan denyut nadi PPG (BPM) langsung dari ESP32." />
              </div>
              <span className="font-mono text-xs text-cyan-400 font-bold bg-cyan-500/10 px-2.5 py-1 rounded-lg border border-cyan-500/30">
                BUFFER: {series.length}
              </span>
            </div>

            <div style={{ height: 280 }}>
              {mounted && series.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={series} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="liveGsrGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#00D4FF" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#00D4FF" stopOpacity={0.0} />
                      </linearGradient>
                      <linearGradient id="liveBpmGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#F43F5E" stopOpacity={0.25} />
                        <stop offset="95%" stopColor="#F43F5E" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="#1E293B" strokeDasharray="3 6" vertical={false} />
                    <XAxis dataKey="timeStr" stroke="#64748B" fontSize={10} fontFamily="Space Mono" interval={4} minTickGap={30} />
                    <YAxis stroke="#64748B" fontSize={10} fontFamily="Space Mono" domain={["auto", "auto"]} />
                    <Tooltip content={<ChartTooltip />} />
                    <ReferenceLine y={7.5} stroke="#F59E0B" strokeDasharray="4 4" label={{ value: "Batas 7.5 μS", fill: "#F59E0B", fontSize: 10, position: "right" }} />
                    <Area type="monotone" dataKey="gsr" stroke="#00D4FF" strokeWidth={2} fill="url(#liveGsrGrad)" name="GSR (μS)" isAnimationActive={false} />
                    <Area type="monotone" dataKey="bpm" stroke="#F43F5E" strokeWidth={2} fill="url(#liveBpmGrad)" name="BPM (PPG)" isAnimationActive={false} />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: 11, paddingTop: 10 }} />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-xs text-slate-500 space-y-1">
                  <span>Menunggu sinyal telemetri...</span>
                </div>
              )}
            </div>
          </div>

          {/* Log Disregulasi dengan Pagination */}
          <Panel
            title={
              <div className="flex items-center justify-between w-full">
                <div className="flex items-center gap-2">
                  <Zap className="h-4 w-4 text-amber-400" />
                  <span className="text-sm font-bold text-white">Log Intervensi & Diagnostik Pemicu</span>
                </div>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-slate-800 text-slate-300 border border-slate-700">
                  {allAlerts.length} Riwayat
                </span>
              </div>
            }
          >
            <div className="space-y-3">
              {pagedAlerts.length > 0 ? (
                pagedAlerts.map((a, idx) => (
                  <div
                    key={`alert-${a.id || idx}-${idx}`}
                    className="p-3.5 rounded-xl bg-slate-900/90 border border-amber-500/30 space-y-2 hover:border-amber-500/60 transition-all shadow-md"
                    style={{ borderLeft: "4px solid #F59E0B" }}
                  >
                    <div className="flex justify-between items-center flex-wrap gap-2 border-b border-slate-800 pb-1.5">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 animate-bounce" />
                        <span className="font-mono text-xs text-slate-200 font-bold">{a.ts}</span>
                      </div>
                      <span className="px-2 py-0.5 rounded text-[9px] font-bold uppercase bg-amber-500/20 text-amber-300 border border-amber-500/40">
                        {a.severity || "HAPTIK AKTIF"}
                      </span>
                    </div>

                    {/* Full Medical & System Reasoning */}
                    <div className="text-xs text-slate-200 leading-relaxed break-words bg-slate-950/70 p-2.5 rounded-lg border border-slate-800/80 font-medium">
                      {a.msg}
                    </div>
                  </div>
                ))
              ) : (
                <div className="py-8 text-center text-xs text-slate-500">
                  Belum ada catatan disregulasi atau intervensi haptik. Kondisi stabil.
                </div>
              )}

              {/* Pagination Controls */}
              {allAlerts.length > ALERTS_PER_PAGE && (
                <div className="flex items-center justify-between pt-3 border-t border-slate-800 text-xs text-slate-400">
                  <span>Hal {alertPage} / {totalPages} ({allAlerts.length} Total)</span>
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => setAlertPage(p => Math.max(1, p - 1))}
                      disabled={alertPage === 1}
                      className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => setAlertPage(p => Math.min(totalPages, p + 1))}
                      disabled={alertPage === totalPages}
                      className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </Panel>
        </div>

        {/* Right Column */}
        <div className="xl:col-span-4 space-y-6">
          <Panel
            title={
              <div className="flex items-center gap-2">
                <span>Indeks Fokus</span>
                <InfoTooltip content="Skor estimasi self-awareness & fokus (0-100%) yang dihitung dari stabilitas GSR dan minimnya pergerakan IMU." />
              </div>
            }
          >
            <FocusGauge value={focusIndex} />
            <div className="mt-4 grid grid-cols-3 gap-2 text-[10px] text-center font-bold">
              <div className="text-emerald-400">🟢 FOKUS</div>
              <div className="text-amber-400">🟡 GELISAH</div>
              <div className="text-rose-400">🔴 OVERLOAD</div>
            </div>
          </Panel>

          <Panel
            title={
              <div className="flex items-center gap-2">
                <span>Subjek Anak</span>
                <InfoTooltip content="Informasi profil subjek penelitian yang saat ini mengenakan gelang wearable biofeedback." />
              </div>
            }
          >
            {activePatient ? (
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div
                    className="h-11 w-11 rounded-xl flex items-center justify-center font-bold text-sm text-slate-950"
                    style={{ background: `linear-gradient(135deg, ${activePatient.avatar_color || "#00D4FF"}, #A78BFA)` }}
                  >
                    {(activePatient.nickname || activePatient.name || "A").slice(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-white text-sm truncate">{activePatient.name}</div>
                    <div className="text-xs text-slate-400">
                      {activePatient.age} Thn · {activePatient.adhd_subtype}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-3 space-y-2">
                <p className="text-xs text-slate-400">Belum ada profil subjek.</p>
                <a href="/patients" className="btn btn-primary text-xs inline-flex items-center">
                  <Plus className="h-3.5 w-3.5 mr-1" /> Tambah
                </a>
              </div>
            )}
          </Panel>

          <Panel
            title={
              <div className="flex items-center gap-2">
                <span>Kontrol Cepat</span>
                <InfoTooltip content="Uji coba manual aktuator haptik ESP32 dan pintasan menu sistem." />
              </div>
            }
          >
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2 pb-1">
                <button
                  className="px-2.5 py-2 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 text-[11px] font-semibold flex items-center justify-center gap-1.5 transition-colors"
                  onClick={() => {
                    api.testHardware("HAPTIC_SHORT", 500);
                    toast.success("⚡ Uji Getar 500ms!");
                  }}
                >
                  <Zap className="h-3.5 w-3.5 text-cyan-400" /> Uji 500ms
                </button>

                <button
                  className="px-2.5 py-2 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[11px] font-semibold flex items-center justify-center gap-1.5 transition-colors"
                  onClick={() => {
                    api.testHardware("HAPTIC_MEDIUM", 1500);
                    toast.success("⚡ Uji Getar 1.5s!");
                  }}
                >
                  <Zap className="h-3.5 w-3.5 text-amber-400" /> Uji 1.5s
                </button>
              </div>

              <a href="/live" className="btn btn-ghost-teal w-full flex items-center justify-center text-xs">
                <Activity className="h-3.5 w-3.5 mr-1.5 text-emerald-400" /> Live Monitor
              </a>
              <a href="/history" className="btn btn-ghost-teal w-full flex items-center justify-center text-xs">
                <Activity className="h-3.5 w-3.5 mr-1.5 text-cyan-400" /> Riwayat Sesi
              </a>
              <a href="/thresholds" className="btn btn-ghost-teal w-full flex items-center justify-center text-xs">
                <Zap className="h-3.5 w-3.5 mr-1.5 text-amber-400" /> Ambang Batas
              </a>
              <button
                className="btn btn-ghost-teal w-full text-xs"
                onClick={() => {
                  window.open("http://localhost:5001/api/export/csv", "_blank");
                  toast.success("Mengekspor CSV...");
                }}
              >
                <Download className="h-3.5 w-3.5 mr-1.5" /> Unduh CSV
              </button>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}

function MetricCard({
  title,
  subtitle,
  info,
  value,
  unit,
  color,
  badge,
  badgeClass,
}: {
  title: string;
  subtitle: string;
  info?: string;
  value: string;
  unit: string;
  color: string;
  badge?: string;
  badgeClass?: string;
}) {
  return (
    <div className="p-4 rounded-2xl bg-[#0B0F1E] border border-[#1E293B] shadow-md flex flex-col justify-between h-[135px]">
      <div className="flex justify-between items-start">
        <div>
          <div className="flex items-center gap-1.5">
            <span className="font-bold text-xs text-white">{title}</span>
            {info && <InfoTooltip content={info} title={title} />}
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">{subtitle}</div>
        </div>
        {badge && (
          <span className={`px-2 py-0.5 rounded text-[9px] font-bold border font-mono ${badgeClass}`}>
            {badge}
          </span>
        )}
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="font-mono text-2xl md:text-3xl font-extrabold" style={{ color }}>
          {value}
        </span>
        <span className="font-mono text-xs text-slate-400">{unit}</span>
      </div>
    </div>
  );
}

function FocusGauge({ value }: { value: number }) {
  const r = 60;
  const c = 2 * Math.PI * r;
  const offset = c - (value / 100) * c * 0.75;
  return (
    <div className="relative flex justify-center py-2">
      <svg width="180" height="150" viewBox="0 0 180 150">
        <defs>
          <linearGradient id="gauge-grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#00D4FF" />
            <stop offset="100%" stopColor="#A78BFA" />
          </linearGradient>
        </defs>
        <circle
          cx="90"
          cy="85"
          r={r}
          stroke="#1E293B"
          strokeWidth="12"
          fill="none"
          strokeDasharray={`${c * 0.75} ${c}`}
          strokeLinecap="round"
          transform="rotate(135 90 85)"
        />
        <circle
          cx="90"
          cy="85"
          r={r}
          stroke="url(#gauge-grad)"
          strokeWidth="12"
          fill="none"
          strokeDasharray={`${c * 0.75} ${c}`}
          strokeDashoffset={offset - c * 0.25}
          strokeLinecap="round"
          transform="rotate(135 90 85)"
          style={{ transition: "stroke-dashoffset 600ms ease" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center pt-2">
        <span className="font-mono text-3xl font-extrabold text-cyan-300">
          {value > 0 ? value : "--"}
          {value > 0 && <span className="text-sm text-slate-400">%</span>}
        </span>
        <span className="text-[9px] tracking-[0.18em] text-slate-400 font-bold">FOKUS</span>
      </div>
    </div>
  );
}
