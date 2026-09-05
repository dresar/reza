import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard, Activity, Users, TrendingUp, History, FileText,
  Sliders, BarChart3, Settings, Terminal, LogOut, UserCheck, HeartHandshake,
  Repeat, Brain
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";

const therapistGroups = [
  {
    label: "Monitoring Utama",
    items: [
      { to: "/",         label: "Dashboard",        Icon: LayoutDashboard },
      { to: "/live",     label: "Live Monitor",     Icon: Activity },
      { to: "/serial",   label: "Serial Monitor",   Icon: Terminal },
      { to: "/patients", label: "Profil Subjek",    Icon: Users },
    ],
  },
  {
    label: "Analitik & Terapi",
    items: [
      { to: "/history", label: "Riwayat Sesi",     Icon: History },
      { to: "/reports", label: "Laporan / PDF",    Icon: BarChart3 },
    ],
  },
  {
    label: "Sistem & Konfigurasi",
    items: [
      { to: "/thresholds", label: "Ambang Batas",   Icon: Sliders },
      { to: "/engine",     label: "Engine & Logika", Icon: Brain },
      { to: "/settings",   label: "Pengaturan IoT", Icon: Settings },
    ],
  },
];

const parentGroups = [
  {
    label: "Pantauan Anak",
    items: [
      { to: "/",         label: "Ringkasan Anak",   Icon: LayoutDashboard },
      { to: "/live",     label: "Live Status",      Icon: Activity },
    ],
  },
  {
    label: "Perkembangan & Laporan",
    items: [
      { to: "/history", label: "Riwayat Sesi",     Icon: History },
      { to: "/reports", label: "Laporan Evaluasi", Icon: BarChart3 },
    ],
  },
];

export function Sidebar() {
  const path = useRouterState({ select: (r) => r.location.pathname });
  const { user, isTherapist, isParent, quickLogin, logout } = useAuth();

  const groups = isParent ? parentGroups : therapistGroups;

  return (
    <aside
      className="fixed top-0 left-0 z-40 h-screen w-64 border-r border-[#1E293B] flex flex-col bg-[#0A0E1A] text-slate-200"
    >
      {/* Brand Header */}
      <div className="h-16 flex items-center gap-3 px-5 border-b border-[#1E293B]/80 bg-[#0B0F1E]">
        <BrainWaveIcon />
        <div className="flex flex-col">
          <div className="font-bold text-base tracking-tight leading-tight">
            ADHD <span className="text-[#00D4FF]">Biofeedback</span>
          </div>
          <span className="text-[10px] text-slate-400 font-mono">
            {isParent ? "Portal Orang Tua" : "Portal Terapis / Admin"}
          </span>
        </div>
      </div>

      {/* Active User Card */}
      <div className="p-3 mx-3 mt-3 rounded-xl bg-slate-900/90 border border-slate-800">
        <div className="flex items-center gap-2.5">
          <div
            className="h-8 w-8 rounded-lg flex items-center justify-center text-xs font-bold text-slate-950 shrink-0"
            style={{ backgroundColor: user?.avatar_color || (isParent ? "#10B981" : "#00D4FF") }}
          >
            {isParent ? "👪" : "👨‍⚕️"}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-bold text-white truncate">
              {user?.name || "Pengguna"}
            </div>
            <div className="text-[10px] text-slate-400 flex items-center gap-1">
              <span className={`inline-block w-1.5 h-1.5 rounded-full ${isParent ? "bg-emerald-400" : "bg-cyan-400"}`} />
              <span className="truncate">{user?.title_or_relation || (isParent ? "Orang Tua" : "Terapis")}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-4 custom-scrollbar">
        {groups.map((g) => (
          <div key={g.label} className="space-y-1">
            <div className="px-3 text-[10px] font-bold tracking-[0.14em] text-slate-500 uppercase">
              {g.label}
            </div>
            <div className="space-y-0.5">
              {g.items.map(({ to, label, Icon }) => {
                const active = path === to;
                return (
                  <Link
                    key={to}
                    to={to}
                    className={`flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-semibold transition-all duration-150 ${
                      active
                        ? isParent
                          ? "bg-[#10B981]/15 text-[#10B981] border border-[#10B981]/30 shadow-[0_0_15px_rgba(16,185,129,0.15)]"
                          : "bg-[#00D4FF]/15 text-[#00D4FF] border border-[#00D4FF]/30 shadow-[0_0_15px_rgba(0,212,255,0.15)]"
                        : "text-slate-400 hover:text-slate-100 hover:bg-white/[0.04]"
                    }`}
                  >
                    <Icon className={`h-4 w-4 shrink-0 ${active ? (isParent ? "text-[#10B981]" : "text-[#00D4FF]") : "text-slate-400"}`} />
                    <span className="truncate">{label}</span>
                    {to === "/serial" && (
                      <span className="ml-auto px-1.5 py-0.2 rounded text-[9px] font-mono font-bold bg-cyan-500/20 text-cyan-300">
                        LIVE
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer Role Switcher & Logout */}
      <div className="p-3 border-t border-[#1E293B] bg-[#070A14] space-y-2">
        <div className="flex items-center justify-between gap-2">
          {/* Quick Switch Role Button */}
          <button
            onClick={() => quickLogin(isParent ? "TERAPIS" : "ORANG_TUA")}
            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700 text-[11px] font-semibold text-slate-300 transition-all hover:text-white"
            title="Ganti Peran Pengguna Cepat"
          >
            <Repeat className="h-3 w-3 text-amber-400" />
            <span>Ganti ke {isParent ? "Terapis" : "Orang Tua"}</span>
          </button>

          {/* Logout / Login Link */}
          <Link
            to="/login"
            className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-rose-500/20 hover:text-rose-400 border border-slate-700 text-slate-400 transition-all"
            title="Halaman Login / Keluar"
          >
            <LogOut className="h-3.5 w-3.5" />
          </Link>
        </div>

        <div className="text-[10px] text-slate-500 font-mono truncate text-center pt-1 border-t border-slate-800/50">
          Muhammad Reza · 2209020111
        </div>
      </div>
    </aside>
  );
}

function BrainWaveIcon() {
  return (
    <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-[#00D4FF] to-[#3B82F6] flex items-center justify-center text-slate-950 font-black text-sm shadow-[0_0_15px_rgba(0,212,255,0.4)]">
      ⚡
    </div>
  );
}
