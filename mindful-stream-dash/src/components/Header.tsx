import { useEffect, useState } from "react";
import { useRouterState, Link } from "@tanstack/react-router";
import { Wifi, UserCheck, HeartHandshake, Baby } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

const titleMap: Record<string, string> = {
  "/":           "Dashboard",
  "/live":       "Live Monitor",
  "/serial":     "Serial Monitor",
  "/patients":   "Data Pasien & Subjek",
  "/history":    "Riwayat Sesi",
  "/thresholds": "Ambang Batas",
  "/reports":    "Laporan",
  "/settings":   "Pengaturan",
  "/login":      "Masuk Portal",
};

export function Header() {
  const path = useRouterState({ select: (r) => r.location.pathname });
  const { user, isParent, linkedPatient } = useAuth();
  const [mounted, setMounted] = useState(false);
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setMounted(true);
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const title = titleMap[path] ?? "ADHD Biofeedback Monitor";
  const timeStr = now ? now.toLocaleTimeString("id-ID", { hour12: false }) : "--:--:--";
  const dateStr = now ? now.toLocaleDateString("id-ID", { weekday: "short", day: "numeric", month: "short" }) : "---";

  return (
    <header
      className="sticky top-0 z-30 h-16 flex items-center justify-between px-6 md:px-8 border-b border-[#1E293B] bg-[#0A0E1A]/90 backdrop-blur-md text-slate-200"
    >
      <div className="flex items-center gap-3 min-w-0">
        <h1 className="text-base md:text-lg font-bold tracking-tight text-white truncate">
          {title}
        </h1>
        {isParent ? (
          <span className="chip chip-emerald text-[10px] px-2.5 py-0.5 font-semibold flex items-center gap-1">
            <HeartHandshake className="h-3 w-3" />
            <span>Mode Orang Tua</span>
          </span>
        ) : (
          <span className="chip chip-teal text-[10px] px-2.5 py-0.5 font-mono flex items-center gap-1">
            <UserCheck className="h-3 w-3" />
            <span>Admin / Terapis</span>
          </span>
        )}
      </div>

      <div className="flex items-center gap-4 shrink-0">
        {/* If Parent, show linked Child Name */}
        {isParent && (
          <div className="hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-xs font-semibold text-emerald-300">
            <Baby className="h-3.5 w-3.5 text-emerald-400" />
            <span>Anak: <strong className="text-white font-bold">{linkedPatient?.name || "Muhammad Reza"}</strong></span>
          </div>
        )}

        <div className="hidden lg:flex items-center gap-2 font-mono text-xs text-slate-400 bg-[#0E1424] px-3 py-1.5 rounded-lg border border-[#1E293B]">
          <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
          <span suppressHydrationWarning>{mounted ? dateStr : "---"}</span>
          <span className="text-slate-600">|</span>
          <span className="text-cyan-300 font-bold" suppressHydrationWarning>
            {mounted ? `${timeStr} WIB` : "--:--:--"}
          </span>
        </div>

        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-1.5 text-xs text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/30">
            <Wifi className="h-3.5 w-3.5" />
            <span className="font-mono text-[10px] font-bold">WS 5001</span>
          </div>

          <Link
            to="/login"
            className="flex items-center gap-2 p-1 pl-2 pr-3 rounded-full bg-slate-900 hover:bg-slate-800 border border-slate-700/80 transition-all cursor-pointer group"
            title="Profil & Ganti Akun"
          >
            <div
              className="h-7 w-7 rounded-full flex items-center justify-center text-[10px] font-bold text-slate-950 shadow-[0_0_10px_rgba(0,212,255,0.3)] shrink-0"
              style={{ background: user?.avatar_color || (isParent ? "linear-gradient(135deg, #10B981, #34D399)" : "linear-gradient(135deg, #00D4FF, #A78BFA)") }}
            >
              {isParent ? "BU" : "MR"}
            </div>
            <div className="hidden sm:flex flex-col text-left">
              <span className="text-[11px] font-bold text-slate-200 group-hover:text-white leading-tight truncate max-w-[120px]">
                {user?.name?.split(" ")[0] || "Pengguna"}
              </span>
              <span className="text-[9px] text-slate-400 font-mono leading-none">
                {isParent ? "Orang Tua" : "Terapis"}
              </span>
            </div>
          </Link>
        </div>
      </div>
    </header>
  );
}
