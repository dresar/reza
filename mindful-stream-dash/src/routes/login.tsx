import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { UserRole } from "@/services/api";
import {
  UserCheck,
  HeartHandshake,
  ShieldCheck,
  ArrowRight,
  Sparkles,
  Lock,
  Mail,
  Zap,
  Activity,
  CheckCircle2,
  Sliders,
  HelpCircle,
  Eye,
  EyeOff
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/login")({
  head: () => ({ meta: [{ title: "Masuk — ADHD Biofeedback System" }] }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const { login, quickLogin, isLoading, user } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [selectedRole, setSelectedRole] = useState<UserRole>("TERAPIS");
  const [submitting, setSubmitting] = useState(false);

  const handleManualLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      toast.error("Silakan masukkan email Anda.");
      return;
    }
    setSubmitting(true);
    const res = await login(email, password);
    setSubmitting(false);

    if (res.success) {
      toast.success(res.message || "Berhasil masuk ke sistem!");
      navigate({ to: "/" });
    } else {
      toast.error(res.message || "Email atau password salah.");
    }
  };

  const handleQuickLogin = async (role: UserRole) => {
    setSubmitting(true);
    const res = await quickLogin(role);
    setSubmitting(false);

    if (res.success) {
      toast.success(res.message || `Login cepat berhasil sebagai ${role === "TERAPIS" ? "Terapis" : "Orang Tua"}`);
      navigate({ to: "/" });
    } else {
      toast.error(res.message || "Gagal melakukan quick login.");
    }
  };

  return (
    <div className="min-h-[85vh] flex flex-col justify-center items-center py-6 px-4">
      {/* Background Glow Elements */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[550px] h-[350px] bg-gradient-to-tr from-cyan-500/10 via-emerald-500/10 to-purple-500/10 blur-[100px] pointer-events-none -z-10" />

      <div className="w-full max-w-4xl space-y-8">
        {/* Header Branding */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 text-xs font-semibold">
            <Sparkles className="h-3.5 w-3.5" />
            <span>Sistem Wearable IoT Biofeedback ADHD · TI UMSU 2026</span>
          </div>

          <h1 className="text-2xl sm:text-4xl font-extrabold text-white tracking-tight">
            Portal Masuk <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#00D4FF] via-teal-300 to-[#10B981]">Multi-Role Access</span>
          </h1>

          <p className="text-sm text-slate-400 max-w-xl mx-auto">
            Pilih peran Anda untuk mengakses sistem monitoring cerdas berbasis biofeedback haptik dan ambang batas fisiologis.
          </p>
        </div>

        {/* 1-CLICK FAST ACCESS BUTTONS (DUMMY / REAL DATABASE) */}
        <div className="bg-slate-900/80 border border-slate-800 p-6 rounded-2xl shadow-2xl backdrop-blur-xl space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-300 uppercase tracking-wider">
              <Zap className="h-4 w-4 text-amber-400" />
              <span>Akses Cepat Demo & Pengujian (1-Click Database Login)</span>
            </div>
            <span className="text-[11px] text-slate-500 font-mono">Tersimpan di Database</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Button Terapis */}
            <button
              type="button"
              onClick={() => handleQuickLogin("TERAPIS")}
              disabled={submitting || isLoading}
              className="group relative flex flex-col p-5 rounded-xl border border-cyan-500/30 bg-gradient-to-br from-cyan-950/40 via-slate-900 to-slate-950 hover:border-cyan-400 hover:shadow-[0_0_25px_rgba(0,212,255,0.25)] transition-all duration-200 text-left"
            >
              <div className="flex items-center justify-between w-full mb-2">
                <div className="h-10 w-10 rounded-xl bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center text-cyan-400 group-hover:scale-110 transition-transform">
                  <UserCheck className="h-5 w-5" />
                </div>
                <span className="chip chip-teal text-[10px]">Akses Penuh</span>
              </div>
              <div className="font-bold text-sm text-white group-hover:text-cyan-300 flex items-center gap-1.5">
                Masuk sebagai Terapis / Admin
                <ArrowRight className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
              </div>
              <div className="text-xs text-slate-400 mt-1">
                dr. Muhammad Reza, S.Kom (<span className="text-cyan-400 font-mono">terapis@adhd-care.id</span>)
              </div>
              <div className="text-[11px] text-slate-500 mt-2 border-t border-slate-800/80 pt-2 flex items-center gap-2">
                <Sliders className="h-3 w-3 text-cyan-400" />
                <span>Atur Threshold, Kalibrasi Sensor, Kelola Data Anak</span>
              </div>
            </button>

            {/* Button Orang Tua */}
            <button
              type="button"
              onClick={() => handleQuickLogin("ORANG_TUA")}
              disabled={submitting || isLoading}
              className="group relative flex flex-col p-5 rounded-xl border border-emerald-500/30 bg-gradient-to-br from-emerald-950/40 via-slate-900 to-slate-950 hover:border-emerald-400 hover:shadow-[0_0_25px_rgba(16,185,129,0.25)] transition-all duration-200 text-left"
            >
              <div className="flex items-center justify-between w-full mb-2">
                <div className="h-10 w-10 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 group-hover:scale-110 transition-transform">
                  <HeartHandshake className="h-5 w-5" />
                </div>
                <span className="chip chip-emerald text-[10px]">Akses Orang Tua</span>
              </div>
              <div className="font-bold text-sm text-white group-hover:text-emerald-300 flex items-center gap-1.5">
                Masuk sebagai Orang Tua / Wali
                <ArrowRight className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
              </div>
              <div className="text-xs text-slate-400 mt-1">
                Bunda Siti Rahmawati (<span className="text-emerald-400 font-mono">ortu.bunda@gmail.com</span>)
              </div>
              <div className="text-[11px] text-slate-500 mt-2 border-t border-slate-800/80 pt-2 flex items-center gap-2">
                <Activity className="h-3 w-3 text-emerald-400" />
                <span>Pantau Status Anak, Catatan Terapi, Panduan Rumah</span>
              </div>
            </button>
          </div>
        </div>

        {/* MANUAL LOGIN FORM ACCORDION / CARD */}
        <div className="bg-slate-900/60 border border-slate-800/80 p-6 rounded-2xl backdrop-blur-md space-y-5">
          <div className="border-b border-slate-800 pb-3 flex items-center justify-between">
            <h2 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
              <Lock className="h-3.5 w-3.5 text-cyan-400" />
              <span>Atau Masuk dengan Email & Kata Sandi</span>
            </h2>
            <span className="text-[11px] text-slate-500">Otentikasi Kustom</span>
          </div>

          <form onSubmit={handleManualLogin} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Alamat Email
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="nama@email.com"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Kata Sandi
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-9 py-2 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-2.5 text-slate-500 hover:text-slate-300"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
                <span>Password demo default: <code className="text-cyan-300 font-mono">password123</code></span>
              </div>

              <button
                type="submit"
                disabled={submitting || isLoading}
                className="inline-flex items-center gap-2 bg-gradient-to-r from-cyan-500 to-teal-500 hover:from-cyan-400 hover:to-teal-400 text-slate-950 font-bold text-xs px-5 py-2.5 rounded-xl shadow-lg shadow-cyan-500/20 transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50"
              >
                {submitting ? "Memproses..." : "Masuk ke Sistem"}
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </form>
        </div>

        {/* ROLE PRIVILEGE EXPLANATION CARD */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800/80 space-y-2">
            <div className="font-bold text-cyan-400 flex items-center gap-2">
              <UserCheck className="h-4 w-4" />
              <span>Hak Akses Terapis / Peneliti</span>
            </div>
            <ul className="space-y-1.5 text-slate-400 text-[11px]">
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-3 w-3 text-cyan-400 shrink-0" />
                <span>Pendaftaran data subjek anak & penautan akun orang tua</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-3 w-3 text-cyan-400 shrink-0" />
                <span>Kalibrasi ambang batas GSR, Heart Rate, & IMU Fidget</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-3 w-3 text-cyan-400 shrink-0" />
                <span>Kontrol uji aktuator haptik & Serial Monitor perangkat ESP32</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-3 w-3 text-cyan-400 shrink-0" />
                <span>Penulisan catatan observasi klinis & ekspor laporan PDF</span>
              </li>
            </ul>
          </div>

          <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800/80 space-y-2">
            <div className="font-bold text-emerald-400 flex items-center gap-2">
              <HeartHandshake className="h-4 w-4" />
              <span>Hak Akses Orang Tua / Wali</span>
            </div>
            <ul className="space-y-1.5 text-slate-400 text-[11px]">
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-3 w-3 text-emerald-400 shrink-0" />
                <span>Tampilan status sederhana (Normal / Aktivitas / Disregulasi)</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-3 w-3 text-emerald-400 shrink-0" />
                <span>Membaca arahan dan catatan terapi dari dokter/terapis</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-3 w-3 text-emerald-400 shrink-0" />
                <span>Riwayat kemajuan harian anak selama sesi pemantauan</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-3 w-3 text-emerald-400 shrink-0" />
                <span>Tanpa pengaturan teknis rumit (Aman & Ramah Keluarga)</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
