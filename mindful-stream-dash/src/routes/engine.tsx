import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { useRealtimeStream } from "@/hooks/useRealtimeStream";
import { Panel } from "@/components/Panel";
import { api } from "@/services/api";
import {
  Brain, Cpu, Zap, Radio, Activity, Wifi, Database,
  ChevronDown, ChevronUp, BookOpen, FlaskConical,
  HeartPulse, Hand, Waves, Smartphone, Server, Monitor,
  ArrowRight, CheckCircle, AlertCircle, Clock, RotateCcw
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export const Route = createFileRoute("/engine")({
  head: () => ({ meta: [{ title: "Engine & Dokumentasi — ADHD Biofeedback" }] }),
  component: EnginePage,
});

// ─────────────────────────────────────────────
// Helper Components
// ─────────────────────────────────────────────

function SectionTitle({ icon: Icon, title, subtitle }: { icon: any; title: string; subtitle: string }) {
  return (
    <div className="flex items-start gap-3 mb-4">
      <div className="w-10 h-10 rounded-xl bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center shrink-0 mt-0.5">
        <Icon className="w-5 h-5 text-cyan-400" />
      </div>
      <div>
        <h2 className="text-base font-bold text-white">{title}</h2>
        <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>
      </div>
    </div>
  );
}

function StateCard({ state, color, emoji, description, score, action }: {
  state: string; color: string; emoji: string; description: string; score: string; action: string;
}) {
  const colorMap: Record<string, string> = {
    green: "border-emerald-500/40 bg-emerald-500/8",
    yellow: "border-yellow-500/40 bg-yellow-500/8",
    orange: "border-orange-500/40 bg-orange-500/8",
    red: "border-rose-500/40 bg-rose-500/8",
  };
  const textMap: Record<string, string> = {
    green: "text-emerald-300",
    yellow: "text-yellow-300",
    orange: "text-orange-300",
    red: "text-rose-300",
  };
  return (
    <div className={`p-4 rounded-xl border ${colorMap[color]} space-y-2`}>
      <div className="flex items-center gap-2">
        <span className="text-2xl">{emoji}</span>
        <span className={`font-bold text-sm ${textMap[color]}`}>{state}</span>
      </div>
      <p className="text-xs text-slate-300 leading-relaxed">{description}</p>
      <div className="flex flex-wrap gap-2 pt-1">
        <span className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 text-[10px] font-mono">Skor: {score}</span>
        <span className={`px-2 py-0.5 rounded-full bg-slate-800 text-[10px] font-semibold ${textMap[color]}`}>{action}</span>
      </div>
    </div>
  );
}

function AlgoCard({ title, formula, explain }: { title: string; formula: string; explain: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-slate-800 rounded-xl overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-4 py-3 bg-slate-900/60 hover:bg-slate-800/60 transition-colors text-left"
        onClick={() => setOpen(!open)}
      >
        <span className="text-sm font-semibold text-white">{title}</span>
        {open ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
      </button>
      {open && (
        <div className="px-4 py-3 bg-slate-950/50 space-y-2">
          <code className="block text-xs text-cyan-300 font-mono bg-slate-900 px-3 py-2 rounded-lg">{formula}</code>
          <p className="text-xs text-slate-400 leading-relaxed">{explain}</p>
        </div>
      )}
    </div>
  );
}

function LiveStateIndicator({ snapshot }: { snapshot: any }) {
  if (!snapshot) return null;
  const state = snapshot?.decision?.state || "Normal";
  const score = snapshot?.decision?.weighted_score?.toFixed(1) || "0";

  const stateConfig: Record<string, { color: string; bg: string; border: string; emoji: string }> = {
    "Normal": { color: "text-emerald-300", bg: "bg-emerald-500/15", border: "border-emerald-500/40", emoji: "🟢" },
    "Peningkatan Aktivitas": { color: "text-yellow-300", bg: "bg-yellow-500/15", border: "border-yellow-500/40", emoji: "🟡" },
    "Indikasi Disregulasi": { color: "text-orange-300", bg: "bg-orange-500/15", border: "border-orange-500/40", emoji: "🟠" },
    "Biofeedback Aktif": { color: "text-rose-300", bg: "bg-rose-500/15", border: "border-rose-500/40", emoji: "🔴" },
  };
  const cfg = stateConfig[state] || stateConfig["Normal"];

  return (
    <div className={`flex items-center gap-3 px-4 py-2.5 rounded-xl border ${cfg.bg} ${cfg.border}`}>
      <span className="text-xl">{cfg.emoji}</span>
      <div>
        <div className={`font-bold text-sm ${cfg.color}`}>{state}</div>
        <div className="text-[10px] text-slate-400 font-mono">Skor Fusion: {score}/100</div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────

function EnginePage() {
  const { isTherapist } = useAuth();
  const { latest, isConnected, activeSession } = useRealtimeStream();
  const [engineDocs, setEngineDocs] = useState<any>(null);
  const [engineSnapshot, setEngineSnapshot] = useState<any>(null);
  const [decisionLog, setDecisionLog] = useState<any[]>([]);
  const [baseline, setBaseline] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"docs" | "live" | "algo" | "log">("docs");
  const DEFAULT_PATIENT = "patient-1786778779697";

  useEffect(() => {
    loadData();
    const interval = setInterval(loadLiveData, 2000);
    return () => clearInterval(interval);
  }, []);

  const loadData = async () => {
    try {
      const [docs] = await Promise.all([
        fetch("/api/engine/docs").then(r => r.json()),
      ]);
      if (docs.success) setEngineDocs(docs.data);
    } catch (e) { console.warn(e); }
    setLoading(false);
  };

  const loadLiveData = async () => {
    try {
      const [snap, log, base] = await Promise.all([
        fetch(`/api/engine/state/${DEFAULT_PATIENT}`).then(r => r.json()),
        fetch(`/api/engine/log/${DEFAULT_PATIENT}`).then(r => r.json()),
        fetch(`/api/engine/baseline/${DEFAULT_PATIENT}`).then(r => r.json()),
      ]);
      if (snap.success) setEngineSnapshot(snap.data);
      if (log.success) setDecisionLog(log.data || []);
      if (base.success) setBaseline(base.data);
    } catch (e) { console.warn(e); }
  };

  const handleReset = async () => {
    await fetch(`/api/engine/reset/${DEFAULT_PATIENT}`, { method: "POST" });
    setEngineSnapshot(null);
    setDecisionLog([]);
    toast.success("✅ Baseline engine direset! Engine akan belajar ulang dari awal.");
  };

  const tabs = [
    { id: "docs", label: "📖 Cara Kerja", icon: BookOpen },
    { id: "live", label: "🔴 Live Engine", icon: Activity },
    { id: "algo", label: "🧮 Algoritma", icon: FlaskConical },
    { id: "log", label: "📋 Log Keputusan", icon: Database },
  ] as const;

  return (
    <div className="space-y-5 max-w-[1200px] mx-auto pb-10">

      {/* Header */}
      <div className="p-4 rounded-2xl bg-[#0B0F1E] border border-[#1E293B] shadow-lg">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="relative w-12 h-12 rounded-xl bg-purple-500/10 border border-purple-500/30 flex items-center justify-center">
              <Brain className="w-6 h-6 text-purple-400" />
              <span className="absolute -top-1 -right-1 w-3 h-3 bg-purple-500 rounded-full animate-pulse" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-white">Otak Backend — Decision Engine</h1>
              <p className="text-xs text-slate-400">Sistem analisis pintar yang ngolah data dari gelang ESP32 buat deteksi stres/gelisah Ananda Reza</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <LiveStateIndicator snapshot={engineSnapshot} />
            {isTherapist && (
              <Button
                size="sm"
                variant="outline"
                onClick={handleReset}
                className="h-8 px-3 text-xs border-slate-700 text-slate-400 hover:text-white"
              >
                <RotateCcw className="w-3 h-3 mr-1" /> Reset Baseline
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Tab Nav */}
      <div className="flex gap-1 bg-[#0B0F1E] border border-[#1E293B] p-1 rounded-xl">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg text-xs font-semibold transition-all ${
              activeTab === tab.id
                ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40"
                : "text-slate-500 hover:text-slate-300"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ═══════════════════════════════════════
          TAB 1: CARA KERJA (Super Non-Formal)
          ═══════════════════════════════════════ */}
      {activeTab === "docs" && (
        <div className="space-y-4">

          {/* Intro */}
          <Panel>
            <SectionTitle icon={BookOpen} title="Apa itu sistem ini? (Bahasa Awam)" subtitle="Penjelasan gampang buat yang gak ngerti IoT" />
            <div className="space-y-3 text-sm text-slate-300 leading-relaxed">
              <p>
                Bayangin kamu pake gelang pintar yang bisa ngerasain kondisi tubuh kamu.
                Gelang itu punya <strong className="text-white">3 sensor</strong>:
              </p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {[
                  { icon: "💦", name: "Sensor GSR (Keringat)", desc: "Ngeukur keringat di kulit tangan. Kalau stres atau gelisah, keringat makin banyak → konduktansi naik!" },
                  { icon: "❤️", name: "Sensor Nadi (MAX30102)", desc: "Ngitung detak jantung (BPM). Kalau jantung berdebar lebih kencang dari biasanya, itu tanda 'sesuatu lagi terjadi'." },
                  { icon: "📐", name: "Sensor Gerak (MPU6050)", desc: "Ngedeteksi gerakan tangan. Anak ADHD sering gelisah, goyang-goyang tangan tanpa sadar — sensor ini yang nangkep itu." },
                ].map(s => (
                  <div key={s.name} className="p-3 rounded-xl bg-slate-900/60 border border-slate-800">
                    <div className="text-2xl mb-2">{s.icon}</div>
                    <div className="font-semibold text-white text-xs mb-1">{s.name}</div>
                    <div className="text-xs text-slate-400 leading-relaxed">{s.desc}</div>
                  </div>
                ))}
              </div>
            </div>
          </Panel>

          {/* Alur Kerja */}
          <Panel>
            <SectionTitle icon={Cpu} title="Gimana alurnya dari gelang sampai getar?" subtitle="Langkah-langkah yang terjadi setiap 800ms (kurang dari 1 detik!)" />
            <div className="space-y-3">
              {[
                {
                  step: "1", icon: Smartphone, color: "cyan",
                  title: "ESP32 Baca Sensor (setiap 20ms)",
                  desc: "Chip kecil di dalam gelang (ESP32-C3) ngeluarin listrik kecil ke kulit, terus ngitung berapa listrik yang nyerap. Hasilnya dikirim tiap 800ms dalam format JSON (teks terstruktur kayak formulir data).",
                },
                {
                  step: "2", icon: Wifi, color: "blue",
                  title: "Data Terbang Lewat WiFi + MQTT",
                  desc: "Data JSON dikirim ke internet via WiFi, lewat server MQTT publik (kayak kantor pos digital di cloud). Server ini nyambungin ESP32 ke backend website.",
                },
                {
                  step: "3", icon: Server, color: "purple",
                  title: "Backend (Otak) Nerima & Analisis",
                  desc: "Node.js di backend nerima data, langsung masukin ke 'mesin analisis'. Mesin ini ngitung dengan rumus matematika: apakah nilai-nilai sensor ini menunjukkan Ananda lagi gelisah?",
                },
                {
                  step: "4", icon: Brain, color: "violet",
                  title: "Decision Engine Tentukan Status",
                  desc: "Engine ngasih skor 0–100 untuk setiap sensor, terus digabung jadi satu keputusan: Normal, Peningkatan Aktivitas, Indikasi Disregulasi, atau Biofeedback Aktif.",
                },
                {
                  step: "5", icon: Zap, color: "amber",
                  title: "Kalau perlu → Kirim Perintah Getar ke ESP32",
                  desc: "Kalau skor gabungan ≥ 75 dan minimal 2 sensor 'berteriak', backend kirim perintah MQTT: 'TRIGGER_HAPTIC 1500ms'. ESP32 langsung getarkan motor di gelang sebagai pengingat biofeedback.",
                },
                {
                  step: "6", icon: Monitor, color: "green",
                  title: "Dashboard Update Realtime",
                  desc: "Semua hasil analisis langsung tampil di website ini via WebSocket. Terapis & orang tua bisa pantau live tanpa perlu refresh halaman.",
                },
              ].map(step => {
                const Icon = step.icon;
                const colorMap: Record<string, string> = {
                  cyan: "bg-cyan-500/15 border-cyan-500/30 text-cyan-400",
                  blue: "bg-blue-500/15 border-blue-500/30 text-blue-400",
                  purple: "bg-purple-500/15 border-purple-500/30 text-purple-400",
                  violet: "bg-violet-500/15 border-violet-500/30 text-violet-400",
                  amber: "bg-amber-500/15 border-amber-500/30 text-amber-400",
                  green: "bg-emerald-500/15 border-emerald-500/30 text-emerald-400",
                };
                return (
                  <div key={step.step} className="flex gap-3">
                    <div className={`w-9 h-9 rounded-xl border ${colorMap[step.color]} flex items-center justify-center shrink-0 mt-0.5`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="flex-1 pb-3 border-b border-slate-800/60 last:border-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[10px] font-mono text-slate-500">LANGKAH {step.step}</span>
                        <span className="font-semibold text-white text-sm">{step.title}</span>
                      </div>
                      <p className="text-xs text-slate-400 leading-relaxed">{step.desc}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </Panel>

          {/* 4 State */}
          <Panel>
            <SectionTitle icon={Activity} title="4 Status yang Dikenali Engine" subtitle="Sesuai terminologi proposal skripsi — bukan diagnosis medis!" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <StateCard
                state="Normal" color="green" emoji="🟢"
                description="Semua sensor dalam batas wajar. Anak lagi tenang, fokus, atau beristirahat normal. Tidak ada aksi apapun yang diambil."
                score="< 25" action="Tidak ada aksi"
              />
              <StateCard
                state="Peningkatan Aktivitas" color="yellow" emoji="🟡"
                description="Satu atau lebih sensor mulai naik tapi belum mengkhawatirkan. Mungkin anak lagi semangat, excited, atau mulai kurang fokus. Dicatat saja."
                score="25 – 50" action="Dicatat (tidak ada haptic)"
              />
              <StateCard
                state="Indikasi Disregulasi" color="orange" emoji="🟠"
                description="Minimal 2 sensor sudah melampaui ambang batas. Kemungkinan anak mulai kesulitan mengatur diri (disregulasi). Alert dikirim ke dashboard."
                score="50 – 75" action="Alert ke dashboard"
              />
              <StateCard
                state="Biofeedback Aktif" color="red" emoji="🔴"
                description="Skor gabungan sangat tinggi. Gelang langsung GETAR sebagai sinyal biofeedback — mengingatkan anak secara fisik untuk tarik napas / kembali fokus."
                score="≥ 75" action="🔴 Haptic motor diaktifkan"
              />
            </div>
          </Panel>

          {/* Kenapa di Backend */}
          <Panel>
            <SectionTitle icon={Server} title="Kenapa logika analisisnya di backend, bukan di ESP32?" subtitle="Keputusan arsitektur penting yang perlu dipahami" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-3">
                <div className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <div>
                    <div className="text-xs font-semibold text-white">Threshold Bisa Diubah Langsung</div>
                    <div className="text-xs text-slate-400 mt-0.5">Kalau threshold ada di ESP32, kamu harus upload ulang kode firmware setiap mau ubah parameter. Di backend, tinggal geser slider di website — langsung berlaku!</div>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <div>
                    <div className="text-xs font-semibold text-white">Bisa Pakai Rumus Lebih Canggih</div>
                    <div className="text-xs text-slate-400 mt-0.5">ESP32 punya memori cuma ~400KB. Backend punya ribuan kali lebih banyak. Bisa pakai EMA, regresi linear, Shannon entropy — rumus yang terlalu berat buat mikrokontroler kecil.</div>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <div>
                    <div className="text-xs font-semibold text-white">Adaptive Baseline Per Anak</div>
                    <div className="text-xs text-slate-400 mt-0.5">Setiap anak punya kondisi tubuh berbeda. Backend mempelajari baseline normal anak secara otomatis dari sampel awal, bukan nilai statis yang sama untuk semua anak.</div>
                  </div>
                </div>
              </div>
              <div className="space-y-3">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <div className="text-xs font-semibold text-white">Tapi... Kalau WiFi Mati?</div>
                    <div className="text-xs text-slate-400 mt-0.5">Tenang! Di dalam firmware ESP32 (<code className="text-cyan-400">ready.ino</code>) masih ada logika safety fallback. Kalau WiFi/MQTT putus, ESP32 tetap bisa getar sendiri pakai threshold yang lebih konservatif (lebih tinggi) sebagai pengaman darurat.</div>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <Clock className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                  <div>
                    <div className="text-xs font-semibold text-white">Latensi Masih Sangat Aman</div>
                    <div className="text-xs text-slate-400 mt-0.5">Total delay dari sensor ESP32 kirim → backend analisis → kirim perintah balik ≈ 50–200ms. Untuk intervensi biofeedback ADHD, ini masih jauh lebih cepat dari kebutuhan klinis (≤2 detik).</div>
                  </div>
                </div>
              </div>
            </div>
          </Panel>

          {/* Sensor Weights */}
          <Panel>
            <SectionTitle icon={HeartPulse} title="Bobot Setiap Sensor dalam Keputusan" subtitle="Kenapa GSR dapet bobot paling tinggi?" />
            <div className="space-y-3">
              {[
                { sensor: "GSR (Keringat Kulit)", weight: 45, color: "cyan", reason: "GSR paling langsung merepresentasikan aktivasi sistem saraf otonom (stres fisiologis). Ini adalah gold standard dalam penelitian psychophysiology." },
                { sensor: "PPG / BPM (Denyut Nadi)", weight: 30, color: "rose", reason: "Denyut nadi bisa dipengaruhi banyak hal (aktivitas fisik, suhu). Dipakai sebagai validator untuk mengurangi false positive dari GSR saja." },
                { sensor: "IMU (Gerak Tubuh)", weight: 25, color: "amber", reason: "Fidgeting adalah indikator behavioral ADHD yang kuat. Dikombinasikan dengan GSR tinggi, ini jadi bukti kuat anak sedang mengalami disregulasi." },
              ].map(s => (
                <div key={s.sensor}>
                  <div className="flex justify-between items-center mb-1.5">
                    <span className="text-xs font-semibold text-white">{s.sensor}</span>
                    <span className="text-xs font-bold text-cyan-300">{s.weight}%</span>
                  </div>
                  <div className="w-full bg-slate-800 rounded-full h-2 mb-1.5">
                    <div
                      className="h-2 rounded-full bg-gradient-to-r from-cyan-500 to-cyan-400"
                      style={{ width: `${s.weight}%` }}
                    />
                  </div>
                  <p className="text-[11px] text-slate-500 leading-relaxed">{s.reason}</p>
                </div>
              ))}
            </div>
          </Panel>

        </div>
      )}

      {/* ═══════════════════════════════════════
          TAB 2: LIVE ENGINE STATE
          ═══════════════════════════════════════ */}
      {activeTab === "live" && (
        <div className="space-y-4">
          {!engineSnapshot ? (
            <Panel>
              <div className="py-10 text-center space-y-3">
                <div className="w-16 h-16 mx-auto rounded-full bg-slate-800 flex items-center justify-center">
                  <Brain className="w-8 h-8 text-slate-600" />
                </div>
                <div className="text-white font-semibold">Engine Menunggu Data</div>
                <div className="text-slate-400 text-sm max-w-md mx-auto leading-relaxed">
                  Engine baru aktif setelah ESP32 mengirim data lewat MQTT. Nyalakan gelang dan tunggu beberapa detik, atau pastikan simulator aktif.
                </div>
              </div>
            </Panel>
          ) : (
            <>
              {/* State Overview */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { label: "State Sekarang", value: engineSnapshot.decision?.state || "-", sub: "Status fisiologis", color: "text-cyan-300" },
                  { label: "Skor Fusion", value: `${engineSnapshot.decision?.weighted_score?.toFixed(1) || 0}/100`, sub: "Gabungan 3 sensor", color: "text-purple-300" },
                  { label: "Confidence", value: `${((engineSnapshot.decision?.confidence || 0) * 100).toFixed(0)}%`, sub: "Keyakinan engine", color: "text-emerald-300" },
                  { label: "Sensor Aktif", value: `${engineSnapshot.decision?.triggered_sensors?.length || 0}/3`, sub: "Melampaui threshold", color: "text-amber-300" },
                ].map(stat => (
                  <div key={stat.label} className="p-3 rounded-xl bg-[#0B0F1E] border border-[#1E293B]">
                    <div className="text-[10px] text-slate-500 mb-1">{stat.label}</div>
                    <div className={`text-lg font-bold ${stat.color} leading-none`}>{stat.value}</div>
                    <div className="text-[10px] text-slate-500 mt-1">{stat.sub}</div>
                  </div>
                ))}
              </div>

              {/* Per-Sensor Analysis */}
              <Panel>
                <SectionTitle icon={FlaskConical} title="Analisis Per Sensor (Real-time)" subtitle="Breakdown skor dan label dari setiap sensor" />
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {/* GSR */}
                  <div className="p-3 rounded-xl bg-slate-900/50 border border-slate-800 space-y-2">
                    <div className="flex items-center gap-2">
                      <Waves className="w-4 h-4 text-cyan-400" />
                      <span className="text-xs font-bold text-white">GSR (Keringat)</span>
                    </div>
                    <div className="text-2xl font-mono font-bold text-cyan-300">{engineSnapshot.gsr?.ema_us?.toFixed(2)} <span className="text-sm text-slate-400">µS</span></div>
                    <div className="text-[10px] text-slate-400">EMA Filtered | Raw: {engineSnapshot.gsr?.raw_us?.toFixed(2)} µS</div>
                    <div className="text-[10px] text-slate-400">Slope: {engineSnapshot.gsr?.slope_us_per_s?.toFixed(3)} µS/s | Perubahan: {engineSnapshot.gsr?.change_pct?.toFixed(1)}%</div>
                    <div className="w-full bg-slate-800 rounded-full h-1.5">
                      <div className="h-1.5 rounded-full bg-cyan-500" style={{ width: `${Math.min(100, engineSnapshot.gsr?.score || 0)}%` }} />
                    </div>
                    <div className="flex justify-between text-[10px]">
                      <span className="text-cyan-300 font-semibold">{engineSnapshot.gsr?.label}</span>
                      <span className="text-slate-400">{engineSnapshot.gsr?.score?.toFixed(0)}pts</span>
                    </div>
                  </div>

                  {/* BPM */}
                  <div className="p-3 rounded-xl bg-slate-900/50 border border-slate-800 space-y-2">
                    <div className="flex items-center gap-2">
                      <HeartPulse className="w-4 h-4 text-rose-400" />
                      <span className="text-xs font-bold text-white">BPM (Denyut Nadi)</span>
                    </div>
                    <div className="text-2xl font-mono font-bold text-rose-300">{engineSnapshot.bpm?.ema_bpm?.toFixed(1)} <span className="text-sm text-slate-400">BPM</span></div>
                    <div className="text-[10px] text-slate-400">EMA Filtered | Raw: {engineSnapshot.bpm?.bpm?.toFixed(1)} BPM</div>
                    <div className="text-[10px] text-slate-400">HRV: {engineSnapshot.bpm?.hrv_rmssd?.toFixed(1)} | Deviasi: {engineSnapshot.bpm?.deviation_from_baseline?.toFixed(1)}</div>
                    <div className="w-full bg-slate-800 rounded-full h-1.5">
                      <div className="h-1.5 rounded-full bg-rose-500" style={{ width: `${Math.min(100, engineSnapshot.bpm?.score || 0)}%` }} />
                    </div>
                    <div className="flex justify-between text-[10px]">
                      <span className="text-rose-300 font-semibold">{engineSnapshot.bpm?.label}</span>
                      <span className="text-slate-400">{engineSnapshot.bpm?.score?.toFixed(0)}pts</span>
                    </div>
                  </div>

                  {/* IMU */}
                  <div className="p-3 rounded-xl bg-slate-900/50 border border-slate-800 space-y-2">
                    <div className="flex items-center gap-2">
                      <Hand className="w-4 h-4 text-amber-400" />
                      <span className="text-xs font-bold text-white">IMU (Gerak Tubuh)</span>
                    </div>
                    <div className="text-2xl font-mono font-bold text-amber-300">{engineSnapshot.imu?.fidget_score} <span className="text-sm text-slate-400">%</span></div>
                    <div className="text-[10px] text-slate-400">Fidget Score | Accel Mag: {engineSnapshot.imu?.accel_magnitude?.toFixed(3)}</div>
                    <div className="text-[10px] text-slate-400">Entropy: {engineSnapshot.imu?.movement_entropy?.toFixed(3)} (keacakan gerak)</div>
                    <div className="w-full bg-slate-800 rounded-full h-1.5">
                      <div className="h-1.5 rounded-full bg-amber-500" style={{ width: `${Math.min(100, engineSnapshot.imu?.score || 0)}%` }} />
                    </div>
                    <div className="flex justify-between text-[10px]">
                      <span className="text-amber-300 font-semibold">{engineSnapshot.imu?.label}</span>
                      <span className="text-slate-400">{engineSnapshot.imu?.score?.toFixed(0)}pts</span>
                    </div>
                  </div>
                </div>
              </Panel>

              {/* Reasoning */}
              <Panel>
                <SectionTitle icon={Brain} title="Alasan Keputusan Engine" subtitle="Penjelasan mengapa engine memilih status ini" />
                <div className="p-3 rounded-xl bg-slate-900/50 border border-slate-800 font-mono text-xs text-slate-300 leading-relaxed break-words">
                  {engineSnapshot.decision?.reasoning || "—"}
                </div>
                {engineSnapshot.decision?.triggered_sensors?.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className="text-xs text-slate-500">Sensor melampaui threshold:</span>
                    {engineSnapshot.decision.triggered_sensors.map((s: string) => (
                      <span key={s} className="px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-300 text-[11px] border border-rose-500/30">{s}</span>
                    ))}
                  </div>
                )}
              </Panel>

              {/* Baseline */}
              {baseline && (
                <Panel>
                  <SectionTitle icon={Database} title="Adaptive Baseline Ananda Reza" subtitle="Nilai normal yang dipelajari engine secara otomatis" />
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
                    {[
                      { label: "GSR Mean", value: `${baseline.gsr_mean?.toFixed(2)} µS`, sub: "Rata-rata kondisi tenang" },
                      { label: "GSR Std Dev", value: `${baseline.gsr_std?.toFixed(2)} µS`, sub: "Variasi normal" },
                      { label: "BPM Mean", value: `${baseline.bpm_mean?.toFixed(1)} BPM`, sub: "Denyut nadi baseline" },
                      { label: "Sampel", value: baseline.sample_count, sub: baseline.is_valid ? "✅ Baseline valid" : "⏳ Belajar..." },
                    ].map(b => (
                      <div key={b.label} className="p-3 rounded-xl bg-slate-900/50 border border-slate-800">
                        <div className="text-[10px] text-slate-500 mb-1">{b.label}</div>
                        <div className="text-base font-bold text-cyan-300">{b.value}</div>
                        <div className="text-[10px] text-slate-500 mt-1">{b.sub}</div>
                      </div>
                    ))}
                  </div>
                </Panel>
              )}
            </>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════
          TAB 3: ALGORITMA
          ═══════════════════════════════════════ */}
      {activeTab === "algo" && (
        <div className="space-y-4">
          <Panel>
            <SectionTitle icon={FlaskConical} title="Algoritma yang Digunakan Engine" subtitle="Klik tiap algoritma untuk lihat formula dan penjelasannya" />
            <div className="space-y-2">
              <AlgoCard
                title="1. EMA — Exponential Moving Average (Filter Noise Sensor)"
                formula="y[t] = α · x[t] + (1 - α) · y[t-1]"
                explain="Sensor itu biasanya 'gemetar' (noise). Tanpa filter, angka lompat-lompat setiap detik. EMA nyatuin angka-angka itu jadi lebih mulus. α (alpha) ngontrol seberapa cepat respon: α tinggi = cepat respon tapi masih noisy, α rendah = smooth tapi lambat. Di sistem ini: α_GSR = 0.20, α_BPM = 0.15."
              />
              <AlgoCard
                title="2. Slope OLS — Deteksi Laju Kenaikan GSR"
                formula="slope = (n·Σxy − Σx·Σy) / (n·Σx² − (Σx)²)"
                explain="Slope ngitung seberapa cepat GSR naik (µS per detik). Kalau slope positif tinggi, artinya keringat naik cepat — itu tanda respons stres akut yang terjadi sekarang, bukan cuma nilai tinggi yang sudah dari tadi. Ini mengurangi false positive dari kondisi 'memang dari sananya tinggi'."
              />
              <AlgoCard
                title="3. Z-Score — Normalisasi Terhadap Baseline Adaptif"
                formula="z = (x − μ_baseline) / σ_baseline"
                explain="Z-score ngukur 'seberapa jauh dari normal' nilai sensor itu. μ (mu) adalah rata-rata kondisi tenang anak, σ (sigma) adalah variasi normalnya. Kalau z = 2, artinya nilai sekarang 2 standar deviasi di atas normal — itu sudah perlu perhatian. Ini penting karena setiap anak punya baseline berbeda!"
              />
              <AlgoCard
                title="4. Shannon Entropy — Ukur Keacakan Gerak IMU"
                formula="H = −Σ p(x) · log₂(p(x))"
                explain="Entropy ngukur seberapa acak gerakan tangan. Gerakan monoton (misal cuma diam) → entropy rendah. Gerakan fidgeting ADHD yang gak beraturan → entropy tinggi. Caranya: nilai accel dibagi ke 8 'keranjang' (bins), terus dihitung distribusinya. Berguna banget buat bedain 'anak lari' vs 'anak gelisah tak beraturan'."
              />
              <AlgoCard
                title="5. Weighted Fusion Matrix — Keputusan Akhir"
                formula="S_total = w_GSR · S_GSR + w_BPM · S_BPM + w_IMU · S_IMU"
                explain="Ini 'otak' dari seluruh sistem. Tiap sensor dikasih bobot sesuai pentingnya (GSR 45%, BPM 30%, IMU 25%). Skor 0–100 tiap sensor dikalikan bobotnya, terus dijumlahkan. Hasilnya S_total 0–100. Kalau ≥75 dan minimal 2 sensor melampaui threshold → Biofeedback Aktif (haptic motor nyala)."
              />
              <AlgoCard
                title="6. Adaptive Baseline (Running Mean & Std)"
                formula="μ_new = μ_old + (x − μ_old)/n"
                explain="Engine belajar 'kondisi normal' anak secara otomatis dari sampel pertama yang masuk. Update baseline hanya dilakukan saat state = Normal (supaya tidak terkontaminasi oleh kondisi stres). Setelah minimal 20 sampel, baseline dianggap valid dan z-score mulai dihitung."
              />
            </div>
          </Panel>

          {/* Fusion Decision Table */}
          <Panel>
            <SectionTitle icon={Brain} title="Tabel Keputusan Fusion" subtitle="Aturan kombinasi sensor untuk menentukan status final" />
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-800">
                    <th className="text-left py-2 pr-4 text-slate-400 font-semibold">GSR</th>
                    <th className="text-left py-2 pr-4 text-slate-400 font-semibold">BPM</th>
                    <th className="text-left py-2 pr-4 text-slate-400 font-semibold">IMU</th>
                    <th className="text-left py-2 pr-4 text-slate-400 font-semibold">Skor ≥</th>
                    <th className="text-left py-2 text-slate-400 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50">
                  {[
                    { gsr: "Normal", bpm: "Normal", imu: "Normal", score: "-", state: "🟢 Normal" },
                    { gsr: "⚠️ Warning", bpm: "Normal", imu: "Normal", score: "25", state: "🟡 Peningkatan" },
                    { gsr: "Normal", bpm: "⚠️ Warning", imu: "Normal", score: "25", state: "🟡 Peningkatan" },
                    { gsr: "⚠️ Warning", bpm: "⚠️ Warning", imu: "Normal", score: "50", state: "🟠 Disregulasi" },
                    { gsr: "⚠️ Warning", bpm: "Normal", imu: "⚠️ Warning", score: "50", state: "🟠 Disregulasi" },
                    { gsr: "🔴 Critical", bpm: "⚠️ Warning", imu: "⚠️ Warning", score: "75", state: "🔴 Biofeedback!" },
                    { gsr: "🔴 Critical", bpm: "Normal", imu: "🔴 Critical", score: "75", state: "🔴 Biofeedback!" },
                  ].map((row, i) => (
                    <tr key={i} className="hover:bg-slate-800/30">
                      <td className="py-2 pr-4 text-slate-300">{row.gsr}</td>
                      <td className="py-2 pr-4 text-slate-300">{row.bpm}</td>
                      <td className="py-2 pr-4 text-slate-300">{row.imu}</td>
                      <td className="py-2 pr-4 font-mono text-cyan-400">{row.score}</td>
                      <td className="py-2 font-semibold text-white">{row.state}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </div>
      )}

      {/* ═══════════════════════════════════════
          TAB 4: LOG KEPUTUSAN
          ═══════════════════════════════════════ */}
      {activeTab === "log" && (
        <Panel>
          <SectionTitle icon={Database} title="Log Transisi Status Engine" subtitle="50 perubahan status terakhir yang dicatat engine" />
          {decisionLog.length === 0 ? (
            <div className="py-8 text-center text-slate-500 text-sm">
              Belum ada log. Engine mencatat setiap kali terjadi perubahan status.
            </div>
          ) : (
            <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
              {decisionLog.slice().reverse().map((entry: any, i: number) => {
                const stateColor: Record<string, string> = {
                  "Normal": "text-emerald-300",
                  "Peningkatan Aktivitas": "text-yellow-300",
                  "Indikasi Disregulasi": "text-orange-300",
                  "Biofeedback Aktif": "text-rose-300",
                };
                return (
                  <div key={i} className="flex gap-3 p-3 rounded-xl bg-slate-900/50 border border-slate-800 text-xs">
                    <div className="text-slate-600 font-mono shrink-0 pt-0.5">
                      {new Date(entry.timestamp).toLocaleTimeString('id-ID', { hour12: false })}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="text-slate-400">{entry.previous_state}</span>
                        <ArrowRight className="w-3 h-3 text-slate-600 shrink-0" />
                        <span className={`font-bold ${stateColor[entry.new_state] || 'text-white'}`}>{entry.new_state}</span>
                        {entry.haptic_triggered && (
                          <span className="px-1.5 py-0.5 bg-rose-500/20 text-rose-300 border border-rose-500/40 rounded text-[10px] font-bold">⚡ HAPTIC</span>
                        )}
                      </div>
                      <div className="text-slate-500 truncate">{entry.reasoning}</div>
                    </div>
                    <div className="text-slate-500 shrink-0 pt-0.5">
                      <span className="font-mono">{entry.weighted_score?.toFixed(1)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Panel>
      )}

    </div>
  );
}
