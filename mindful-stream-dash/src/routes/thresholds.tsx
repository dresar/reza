import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, useEffect } from "react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, ResponsiveContainer, ReferenceLine, Tooltip } from "recharts";
import { Save, RotateCcw, CheckCircle2, Sliders, Shield, Zap } from "lucide-react";
import { Panel } from "@/components/Panel";
import { ChartTooltip } from "@/components/ChartTooltip";
import { InfoTooltip } from "@/components/InfoTooltip";
import { api } from "@/services/api";
import { useRealtimeStream } from "@/hooks/useRealtimeStream";
import { toast } from "sonner";

export const Route = createFileRoute("/thresholds")({
  head: () => ({ meta: [{ title: "Ambang Batas — ADHD Biofeedback" }] }),
  component: Thresholds,
});

const DEFAULTS = {
  gsr: 7.5,
  bpm: 110,
  motion: 65,
  haptic: "Medium" as "Low" | "Medium" | "High",
  duration: 1500,
  cooldown: 5,
  autoEnabled: true,
};

function Thresholds() {
  const [cfg, setCfg] = useState(DEFAULTS);
  const [loading, setLoading] = useState(false);
  const { series } = useRealtimeStream();

  useEffect(() => {
    api.getThresholds("default").then((data) => {
      if (data) {
        setCfg({
          gsr: data.gsr_critical_us || 7.5,
          bpm: data.bpm_max || 110,
          motion: data.imu_fidget_threshold || 65,
          haptic: data.haptic_intensity_pct > 80 ? "High" : data.haptic_intensity_pct < 60 ? "Low" : "Medium",
          duration: data.haptic_duration_ms || 1500,
          cooldown: data.haptic_cooldown_sec || 5,
          autoEnabled: data.auto_intervention_enabled !== false,
        });
      }
    }).catch(console.error);
  }, []);

  const handleSave = async () => {
    setLoading(true);
    try {
      await api.saveThresholds({
        id: "thresh-default",
        patient_id: "default",
        gsr_warning_us: +(cfg.gsr * 0.8).toFixed(1),
        gsr_critical_us: cfg.gsr,
        bpm_min: 60,
        bpm_max: cfg.bpm,
        imu_fidget_threshold: cfg.motion,
        haptic_intensity_pct: cfg.haptic === "High" ? 100 : cfg.haptic === "Low" ? 50 : 80,
        haptic_duration_ms: cfg.duration,
        haptic_cooldown_sec: cfg.cooldown,
        auto_intervention_enabled: cfg.autoEnabled,
      });
      toast.success("Ambang batas disimpan ke ESP32!");
    } catch (e) {
      toast.error("Gagal menyimpan ambang batas.");
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setCfg(DEFAULTS);
    toast.info("Ambang batas dikembalikan ke default.");
  };

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto pb-8">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-bold text-white">Ambang Batas Sensor</h2>
          <InfoTooltip content="Parameter ambang batas fisiologis yang digunakan oleh edge logic ESP32 untuk memicu intervensi getar biofeedback secara mandiri." />
        </div>
        <div className="flex gap-2">
          <button className="btn btn-ghost-teal text-xs flex items-center" onClick={handleReset}>
            <RotateCcw className="h-3.5 w-3.5 mr-1" /> Reset
          </button>
          <button className="btn btn-primary text-xs flex items-center" onClick={handleSave} disabled={loading}>
            <Save className="h-3.5 w-3.5 mr-1" /> {loading ? "Menyimpan..." : "Simpan"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* Sliders Configuration Column */}
        <div className="xl:col-span-6 space-y-6">
          <Panel
            title={
              <div className="flex items-center gap-2">
                <span>Parameter Trigger</span>
                <InfoTooltip content="Batas nilai sensor fisiologis anak sebelum stimulus getaran haptik diaktifkan." />
              </div>
            }
          >
            <div className="space-y-5">
              {/* GSR */}
              <div className="space-y-2">
                <div className="flex justify-between items-center text-xs">
                  <div className="flex items-center gap-1.5 font-semibold text-slate-200">
                    <span>Batas Kritis GSR</span>
                    <InfoTooltip content="Ambang batas konduktansi kulit (μS) untuk mendeteksi disregulasi emosi atau stres simpatis. Default: 7.5 μS." />
                  </div>
                  <span className="font-mono text-cyan-300 font-bold text-sm">{cfg.gsr.toFixed(1)} μS</span>
                </div>
                <input
                  type="range"
                  min="2.0"
                  max="15.0"
                  step="0.1"
                  value={cfg.gsr}
                  onChange={(e) => setCfg({ ...cfg, gsr: parseFloat(e.target.value) })}
                  className="w-full accent-[#00D4FF]"
                />
                <div className="flex justify-between text-[10px] text-slate-500 font-mono">
                  <span>2.0 μS (Tenang)</span>
                  <span>7.5 μS (Disregulasi)</span>
                  <span>15.0 μS (Ekstrem)</span>
                </div>
              </div>

              {/* Heart Rate */}
              <div className="space-y-2">
                <div className="flex justify-between items-center text-xs">
                  <div className="flex items-center gap-1.5 font-semibold text-slate-200">
                    <span>Batas Maksimal Detak Jantung</span>
                    <InfoTooltip content="Batas denyut nadi maksimal (BPM) dari PPG MAX30102. Default: 110 BPM." />
                  </div>
                  <span className="font-mono text-rose-400 font-bold text-sm">{cfg.bpm} BPM</span>
                </div>
                <input
                  type="range"
                  min="80"
                  max="160"
                  step="1"
                  value={cfg.bpm}
                  onChange={(e) => setCfg({ ...cfg, bpm: parseInt(e.target.value) })}
                  className="w-full accent-[#F43F5E]"
                />
                <div className="flex justify-between text-[10px] text-slate-500 font-mono">
                  <span>80 BPM</span>
                  <span>110 BPM (Stres)</span>
                  <span>160 BPM</span>
                </div>
              </div>

              {/* Motion Fidget */}
              <div className="space-y-2">
                <div className="flex justify-between items-center text-xs">
                  <div className="flex items-center gap-1.5 font-semibold text-slate-200">
                    <span>Batas Fidgeting IMU</span>
                    <InfoTooltip content="Batas skor gerak akselerometer MPU6050 untuk mendeteksi hiperaktivitas motorik. Default: 65%." />
                  </div>
                  <span className="font-mono text-amber-400 font-bold text-sm">{cfg.motion}%</span>
                </div>
                <input
                  type="range"
                  min="20"
                  max="95"
                  step="1"
                  value={cfg.motion}
                  onChange={(e) => setCfg({ ...cfg, motion: parseInt(e.target.value) })}
                  className="w-full accent-[#F59E0B]"
                />
                <div className="flex justify-between text-[10px] text-slate-500 font-mono">
                  <span>20% (Tenang)</span>
                  <span>65% (Fidgeting)</span>
                  <span>95% (Hiperaktif)</span>
                </div>
              </div>
            </div>
          </Panel>

          <Panel
            title={
              <div className="flex items-center gap-2">
                <span>Stimulus Haptik</span>
                <InfoTooltip content="Konfigurasi kekuatan getar, durasi pulsa, dan jeda jeda aman aktuator biofeedback." />
              </div>
            }
          >
            <div className="space-y-4">
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-200">
                  <span>Intensitas Getaran (PWM)</span>
                  <InfoTooltip content="Tingkat daya getaran motor haptik koin." />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {(["Low", "Medium", "High"] as const).map((lvl) => (
                    <button
                      key={lvl}
                      type="button"
                      onClick={() => setCfg({ ...cfg, haptic: lvl })}
                      className={`py-2 rounded-lg text-xs font-semibold border transition-all ${
                        cfg.haptic === lvl
                          ? "bg-[#00D4FF]/20 text-[#00D4FF] border-[#00D4FF]"
                          : "bg-[#070A14] text-slate-400 border-[#1E293B]"
                      }`}
                    >
                      {lvl === "Low" ? "50%" : lvl === "Medium" ? "80%" : "100%"}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex justify-between text-xs">
                  <div className="flex items-center gap-1.5 font-semibold text-slate-200">
                    <span>Durasi Pulsa</span>
                    <InfoTooltip content="Lama waktu motor getar aktif setiap kali disregulasi terjadi." />
                  </div>
                  <span className="font-mono text-white font-bold">{cfg.duration} ms</span>
                </div>
                <input
                  type="range"
                  min="500"
                  max="3000"
                  step="100"
                  value={cfg.duration}
                  onChange={(e) => setCfg({ ...cfg, duration: parseInt(e.target.value) })}
                  className="w-full accent-cyan-400"
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex justify-between text-xs">
                  <div className="flex items-center gap-1.5 font-semibold text-slate-200">
                    <span>Jeda Cooldown</span>
                    <InfoTooltip content="Jeda waktu minimal antar getaran untuk mencegah sensory overload pada anak." />
                  </div>
                  <span className="font-mono text-white font-bold">{cfg.cooldown} s</span>
                </div>
                <input
                  type="range"
                  min="2"
                  max="30"
                  step="1"
                  value={cfg.cooldown}
                  onChange={(e) => setCfg({ ...cfg, cooldown: parseInt(e.target.value) })}
                  className="w-full accent-cyan-400"
                />
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl bg-[#070A14] border border-[#1E293B]">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold text-white">Auto-Trigger</span>
                  <InfoTooltip content="Pemicuan getar otomatis oleh firmware ESP32 jika ambang batas terlampaui." />
                </div>
                <input
                  type="checkbox"
                  checked={cfg.autoEnabled}
                  onChange={(e) => setCfg({ ...cfg, autoEnabled: e.target.checked })}
                  className="h-4 w-4 accent-cyan-400 rounded cursor-pointer"
                />
              </div>

              {/* Tombol Uji Getar Langsung Sesuai Durasi Slider */}
              <button
                type="button"
                onClick={() => {
                  api.testHardware("HAPTIC_CUSTOM", cfg.duration);
                  toast.success(`⚡ Menguji getaran ${cfg.duration}ms!`);
                }}
                className="w-full py-2.5 px-4 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-amber-300 text-xs font-bold flex items-center justify-center gap-2 transition-all shadow-[0_0_15px_rgba(245,158,11,0.15)]"
              >
                <Zap className="h-4 w-4 text-amber-400" />
                Uji Getar ({cfg.duration} ms)
              </button>
            </div>
          </Panel>
        </div>

        {/* Live Preview Column */}
        <div className="xl:col-span-6 space-y-6">
          <Panel
            title={
              <div className="flex items-center gap-2">
                <span>Pratinjau Batas GSR</span>
                <InfoTooltip content="Garis putus-putus merah menandakan batas ambang kritis GSR terhadap aliran telemetri langsung." />
              </div>
            }
          >
            <div className="space-y-4">
              <div style={{ height: 260 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={series} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid stroke="#1E293B" strokeDasharray="3 6" vertical={false} />
                    <XAxis dataKey="timeStr" stroke="#64748B" fontSize={10} fontFamily="Space Mono" interval={4} />
                    <YAxis stroke="#64748B" fontSize={10} fontFamily="Space Mono" domain={[0, 15]} />
                    <Tooltip content={<ChartTooltip />} />
                    <ReferenceLine
                      y={cfg.gsr}
                      stroke="#F43F5E"
                      strokeWidth={2}
                      strokeDasharray="4 4"
                      label={{ value: `${cfg.gsr} μS`, fill: "#F43F5E", fontSize: 10, position: "right" }}
                    />
                    <Area type="monotone" dataKey="gsr" stroke="#00D4FF" fill="#00D4FF" fillOpacity={0.15} strokeWidth={2} name="GSR (μS)" isAnimationActive={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              <div className="p-3 rounded-xl bg-[#070A14] border border-[#1E293B] flex items-center gap-2 text-xs">
                <Shield className="h-4 w-4 text-cyan-400 shrink-0" />
                <span className="text-slate-300 text-[11px]">
                  Pemicu aktif jika GSR &gt; <strong className="text-white">{cfg.gsr} μS</strong> atau BPM &gt; <strong className="text-white">{cfg.bpm}</strong>.
                </span>
              </div>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}

