import React, { useMemo, useState, useEffect, useCallback } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  Download,
  Trash2,
  Search,
  RefreshCw,
  X,
  Activity,
  Zap,
  Clock,
  FileText,
  Heart,
  Sliders
} from "lucide-react";
import { Panel } from "@/components/Panel";
import { InfoTooltip } from "@/components/InfoTooltip";
import { api, MonitoringSession, AlertEvent } from "@/services/api";
import { toast } from "sonner";

export const Route = createFileRoute("/history")({
  head: () => ({ meta: [{ title: "Riwayat Sesi & CRUD — ADHD Biofeedback" }] }),
  component: HistoryLog,
});

function HistoryLog() {
  const [sessions, setSessions] = useState<MonitoringSession[]>([]);
  const [alerts, setAlerts] = useState<AlertEvent[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [filter, setFilter] = useState<string>("All");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [sort, setSort] = useState<{ key: "start_time" | "avg_bpm" | "avg_gsr" | "duration_seconds"; dir: "asc" | "desc" }>({
    key: "start_time",
    dir: "desc",
  });
  const [page, setPage] = useState(1);
  const PAGE = 8;

  // Inline Expandable Row state (No blocking modals!)
  const [expandedSessionId, setExpandedSessionId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState<boolean>(false);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);

  const fetchHistoryData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [sess, al] = await Promise.all([api.getSessions(), api.getAlerts()]);
      setSessions(sess || []);
      setAlerts(al || []);
    } catch (err) {
      console.error("Gagal memuat riwayat sesi:", err);
      if (!silent) toast.error("Gagal memuat data riwayat dari server.");
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHistoryData();

    // WebSocket listener for live auto-sync
    const ws = new WebSocket("ws://localhost:5001");
    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (
          msg.type === "SESSION_STOPPED" ||
          msg.type === "SESSION_DELETED" ||
          msg.type === "ALL_SESSIONS_CLEARED" ||
          msg.type === "TELEMETRY"
        ) {
          fetchHistoryData(true);
        }
      } catch (e) {
        // ignore parse error
      }
    };

    return () => {
      ws.close();
    };
  }, [fetchHistoryData]);

  // Filter & Search Logic
  const rows = useMemo(() => {
    let result = [...sessions];

    if (filter !== "All") {
      result = result.filter((r) => r.status === filter);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (r) =>
          r.title.toLowerCase().includes(q) ||
          r.id.toLowerCase().includes(q) ||
          r.patient_id.toLowerCase().includes(q) ||
          (r.notes && r.notes.toLowerCase().includes(q))
      );
    }

    result.sort((a, b) => {
      let av: number = 0;
      let bv: number = 0;
      if (sort.key === "start_time") {
        av = new Date(a.start_time).getTime();
        bv = new Date(b.start_time).getTime();
      } else {
        av = (a[sort.key] as number) || 0;
        bv = (b[sort.key] as number) || 0;
      }
      return sort.dir === "asc" ? av - bv : bv - av;
    });

    return result;
  }, [sessions, filter, searchQuery, sort]);

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE));
  const paged = rows.slice((page - 1) * PAGE, page * PAGE);

  const toggleSort = (key: typeof sort.key) => {
    setSort((prev) => ({
      key,
      dir: prev.key === key && prev.dir === "desc" ? "asc" : "desc",
    }));
  };

  const toggleExpand = (sessionId: string) => {
    setExpandedSessionId((prev) => (prev === sessionId ? null : sessionId));
    setConfirmDeleteId(null);
  };

  // CRUD: Delete Single Session
  const handleDeleteSession = async (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setIsDeleting(true);
    try {
      await api.deleteSession(id);
      setSessions((prev) => prev.filter((s) => s.id !== id));
      if (expandedSessionId === id) setExpandedSessionId(null);
      setConfirmDeleteId(null);
      toast.success("Sesi berhasil dihapus.");
    } catch (err) {
      toast.error("Gagal menghapus sesi.");
    } finally {
      setIsDeleting(false);
    }
  };

  // CRUD: Clear All Sessions
  const handleClearAllSessions = async () => {
    setIsDeleting(true);
    try {
      await api.clearAllSessions();
      setSessions([]);
      setExpandedSessionId(null);
      setShowClearConfirm(false);
      toast.success("Seluruh riwayat sesi berhasil dibersihkan.");
    } catch (err) {
      toast.error("Gagal menghapus seluruh sesi.");
    } finally {
      setIsDeleting(false);
    }
  };

  // Export CSV Handler
  const handleExportCSV = () => {
    if (rows.length === 0) {
      toast.error("Tidak ada data sesi untuk diekspor.");
      return;
    }
    const headers = [
      "ID Sesi",
      "Pasien ID",
      "Judul",
      "Waktu Mulai",
      "Waktu Selesai",
      "Durasi (detik)",
      "Status",
      "Rata-rata BPM",
      "Puncak BPM",
      "Rata-rata GSR (uS)",
      "Puncak GSR (uS)",
      "Total Intervensi Haptik",
      "Catatan",
    ];

    const csvRows = rows.map((r) => [
      `"${r.id}"`,
      `"${r.patient_id}"`,
      `"${r.title.replace(/"/g, '""')}"`,
      `"${new Date(r.start_time).toLocaleString("id-ID")}"`,
      `"${r.end_time ? new Date(r.end_time).toLocaleString("id-ID") : "-"}"`,
      r.duration_seconds || 0,
      `"${r.status}"`,
      r.avg_bpm || 0,
      r.peak_bpm || 0,
      r.avg_gsr || 0,
      r.peak_gsr || 0,
      r.alert_count || 0,
      `"${(r.notes || "").replace(/"/g, '""')}"`,
    ]);

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...csvRows.map((e) => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `riwayat_sesi_adhd_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("File CSV riwayat sesi berhasil diunduh.");
  };

  // Top Summary Computations
  const stats = useMemo(() => {
    const totalSess = sessions.length;
    const totalAlerts = sessions.reduce((acc, s) => acc + (s.alert_count || 0), 0) || alerts.length;
    const validBpms = sessions.map((s) => s.avg_bpm).filter((b) => typeof b === "number" && b > 0);
    const validGsrs = sessions.map((s) => s.avg_gsr).filter((g) => typeof g === "number" && g > 0);

    const avgBpm = validBpms.length > 0 ? (validBpms.reduce((a, b) => a + b, 0) / validBpms.length).toFixed(1) : "84.5";
    const avgGsr = validGsrs.length > 0 ? (validGsrs.reduce((a, b) => a + b, 0) / validGsrs.length).toFixed(2) : "3.45";

    return { totalSess, totalAlerts, avgBpm, avgGsr };
  }, [sessions, alerts]);

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto pb-12">
      {/* 4 Sleek Summary Metric Badges */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 flex items-center justify-between shadow-sm">
          <div>
            <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              Total Sesi
              <InfoTooltip content="Jumlah keseluruhan rekaman sesi monitoring fisiologis." />
            </div>
            <div className="text-2xl font-black text-white mt-1 font-mono">{stats.totalSess}</div>
          </div>
          <div className="p-2.5 rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
            <Activity className="h-5 w-5" />
          </div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 flex items-center justify-between shadow-sm">
          <div>
            <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              Intervensi Haptik
              <InfoTooltip content="Total stimulus getar biofeedback yang telah dikirim ke pergelangan tangan anak." />
            </div>
            <div className="text-2xl font-black text-amber-400 mt-1 font-mono">{stats.totalAlerts}</div>
          </div>
          <div className="p-2.5 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <Zap className="h-5 w-5" />
          </div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 flex items-center justify-between shadow-sm">
          <div>
            <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              Rata-rata BPM
              <InfoTooltip content="Rata-rata denyut nadi jantung anak di seluruh sesi." />
            </div>
            <div className="text-2xl font-black text-rose-400 mt-1 font-mono">{stats.avgBpm} <span className="text-xs text-slate-500 font-sans">BPM</span></div>
          </div>
          <div className="p-2.5 rounded-lg bg-rose-500/10 text-rose-400 border border-rose-500/20">
            <Heart className="h-5 w-5" />
          </div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 flex items-center justify-between shadow-sm">
          <div>
            <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              Rata-rata GSR
              <InfoTooltip content="Rata-rata konduktansi respon kulit mikro (μS)." />
            </div>
            <div className="text-2xl font-black text-cyan-400 mt-1 font-mono">{stats.avgGsr} <span className="text-xs text-slate-500 font-sans">μS</span></div>
          </div>
          <div className="p-2.5 rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
            <Sliders className="h-5 w-5" />
          </div>
        </div>
      </div>

      {/* Main Table Panel */}
      <Panel
        title={
          <div className="flex items-center gap-2">
            <span>Log Riwayat Sesi & Rekam Data</span>
            <InfoTooltip content="Daftar rekaman sesi pemantauan fisiologis. Klik baris sesi untuk melihat rincian lengkap parameter tanpa modal popup." />
          </div>
        }
      >
        {/* Simple, Clean, Non-Wrapped Toolbar */}
        <div className="p-4 border-b border-slate-800/80 bg-slate-950/40 flex flex-wrap items-center justify-between gap-3">
          {/* Left: Search & Filter */}
          <div className="flex items-center flex-wrap gap-2 flex-1 min-w-[280px]">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                placeholder="Cari judul, ID, catatan..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setPage(1);
                }}
                className="w-full pl-9 pr-8 py-1.5 text-xs bg-slate-900/90 border border-slate-700/80 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition-colors"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>

            <select
              value={filter}
              onChange={(e) => {
                setFilter(e.target.value);
                setPage(1);
              }}
              className="py-1.5 px-3 text-xs bg-slate-900/90 border border-slate-700/80 rounded-lg text-slate-200 focus:outline-none focus:border-cyan-500 transition-colors"
            >
              <option value="All">Semua Status</option>
              <option value="COMPLETED">Selesai (COMPLETED)</option>
              <option value="ACTIVE">Sedang Aktif (ACTIVE)</option>
            </select>
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => fetchHistoryData()}
              className="btn btn-ghost-teal text-xs flex items-center gap-1 py-1.5 px-2.5"
              title="Perbarui Data"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            </button>

            <button
              onClick={handleExportCSV}
              className="btn btn-ghost-teal text-xs flex items-center gap-1 py-1.5 px-3"
            >
              <Download className="h-3.5 w-3.5" /> Ekspor CSV
            </button>

            {/* Smart Clear All with Inline Confirm */}
            {showClearConfirm ? (
              <div className="flex items-center gap-1.5 bg-rose-950/80 border border-rose-500/50 px-2 py-1 rounded-lg">
                <span className="text-[11px] text-rose-300 font-medium">Hapus semua ({sessions.length})?</span>
                <button
                  onClick={handleClearAllSessions}
                  disabled={isDeleting}
                  className="px-2 py-0.5 rounded text-[11px] font-bold bg-rose-600 hover:bg-rose-500 text-white transition-colors"
                >
                  {isDeleting ? "..." : "Ya, Hapus"}
                </button>
                <button
                  onClick={() => setShowClearConfirm(false)}
                  className="px-1.5 py-0.5 rounded text-[11px] text-slate-400 hover:text-white"
                >
                  Batal
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowClearConfirm(true)}
                disabled={sessions.length === 0}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold text-rose-400 hover:text-rose-300 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
              >
                <Trash2 className="h-3.5 w-3.5" /> Hapus Semua
              </button>
            )}
          </div>
        </div>

        {/* Table Content */}
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="text-[11px] text-slate-400 uppercase tracking-wider bg-slate-900/60 border-b border-slate-800">
              <tr>
                <th className="py-3 px-4 w-10 text-center"></th>
                <th
                  className="py-3 px-4 cursor-pointer hover:text-cyan-400 transition-colors"
                  onClick={() => toggleSort("start_time")}
                >
                  <div className="flex items-center gap-1">
                    Waktu Sesi
                    {sort.key === "start_time" && (
                      sort.dir === "desc" ? <ArrowDown className="h-3 w-3 text-cyan-400" /> : <ArrowUp className="h-3 w-3 text-cyan-400" />
                    )}
                  </div>
                </th>
                <th className="py-3 px-4">Judul & Pasien</th>
                <th
                  className="py-3 px-4 cursor-pointer hover:text-cyan-400 transition-colors"
                  onClick={() => toggleSort("avg_bpm")}
                >
                  <div className="flex items-center gap-1">
                    Avg BPM
                    {sort.key === "avg_bpm" && (
                      sort.dir === "desc" ? <ArrowDown className="h-3 w-3 text-cyan-400" /> : <ArrowUp className="h-3 w-3 text-cyan-400" />
                    )}
                  </div>
                </th>
                <th
                  className="py-3 px-4 cursor-pointer hover:text-cyan-400 transition-colors"
                  onClick={() => toggleSort("avg_gsr")}
                >
                  <div className="flex items-center gap-1">
                    Avg GSR (μS)
                    {sort.key === "avg_gsr" && (
                      sort.dir === "desc" ? <ArrowDown className="h-3 w-3 text-cyan-400" /> : <ArrowUp className="h-3 w-3 text-cyan-400" />
                    )}
                  </div>
                </th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-center">Intervensi</th>
                <th
                  className="py-3 px-4 cursor-pointer hover:text-cyan-400 transition-colors"
                  onClick={() => toggleSort("duration_seconds")}
                >
                  <div className="flex items-center gap-1">
                    Durasi
                    {sort.key === "duration_seconds" && (
                      sort.dir === "desc" ? <ArrowDown className="h-3 w-3 text-cyan-400" /> : <ArrowUp className="h-3 w-3 text-cyan-400" />
                    )}
                  </div>
                </th>
                <th className="py-3 px-4 text-right">Aksi</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-800/60 font-medium text-slate-300">
              {loading && sessions.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-500">
                    <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2 text-cyan-500" />
                    Memuat riwayat sesi...
                  </td>
                </tr>
              ) : paged.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-500">
                    Tidak ada data sesi yang sesuai dengan kriteria.
                  </td>
                </tr>
              ) : (
                paged.map((s) => {
                  const isExpanded = expandedSessionId === s.id;
                  const isConfirmingDelete = confirmDeleteId === s.id;
                  const durMin = Math.floor((s.duration_seconds || 0) / 60);
                  const durSec = (s.duration_seconds || 0) % 60;
                  const durStr = durMin > 0 ? `${durMin}m ${durSec}s` : `${durSec}s`;

                  return (
                    <React.Fragment key={s.id}>
                      {/* Main Clickable Row */}
                      <tr
                        onClick={() => toggleExpand(s.id)}
                        className={`cursor-pointer transition-colors ${
                          isExpanded
                            ? "bg-cyan-950/20 border-l-2 border-cyan-400"
                            : "hover:bg-slate-900/60"
                        }`}
                      >
                        {/* Expand Chevron */}
                        <td className="py-3 px-3 text-center text-slate-400">
                          {isExpanded ? (
                            <ChevronUp className="h-4 w-4 text-cyan-400 mx-auto" />
                          ) : (
                            <ChevronDown className="h-4 w-4 text-slate-500 hover:text-slate-300 mx-auto" />
                          )}
                        </td>

                        {/* Date & Time */}
                        <td className="py-3 px-4 whitespace-nowrap">
                          <div className="font-bold text-white">
                            {new Date(s.start_time).toLocaleDateString("id-ID", {
                              day: "2-digit",
                              month: "short",
                              year: "numeric",
                            })}
                          </div>
                          <div className="font-mono text-[11px] text-slate-400">
                            {new Date(s.start_time).toLocaleTimeString("id-ID", { hour12: false })}
                          </div>
                        </td>

                        {/* Title & Patient */}
                        <td className="py-3 px-4">
                          <div className="font-semibold text-white truncate max-w-xs">{s.title}</div>
                          <div className="text-[11px] text-cyan-400/90 font-mono">{s.patient_id}</div>
                        </td>

                        {/* Avg BPM */}
                        <td className="py-3 px-4 font-mono font-bold text-slate-200">
                          {s.avg_bpm > 0 ? `${s.avg_bpm}` : <span className="text-slate-500 font-normal">--</span>}
                        </td>

                        {/* Avg GSR */}
                        <td className="py-3 px-4 font-mono font-bold text-slate-200">
                          {s.avg_gsr > 0 ? `${s.avg_gsr}` : <span className="text-slate-500 font-normal">--</span>}
                        </td>

                        {/* Status Badge */}
                        <td className="py-3 px-4 whitespace-nowrap">
                          <span
                            className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border uppercase tracking-wider ${
                              s.status === "ACTIVE"
                                ? "bg-cyan-500/20 text-cyan-300 border-cyan-500/40 animate-pulse"
                                : "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                            }`}
                          >
                            {s.status}
                          </span>
                        </td>

                        {/* Intervensi count */}
                        <td className="py-3 px-4 text-center font-mono">
                          {s.alert_count > 0 ? (
                            <span className="px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 font-bold border border-amber-500/30 text-[11px]">
                              ⚡ {s.alert_count}x
                            </span>
                          ) : (
                            <span className="text-slate-600 text-xs">○</span>
                          )}
                        </td>

                        {/* Duration */}
                        <td className="py-3 px-4 font-mono text-slate-300 whitespace-nowrap">
                          {durStr}
                        </td>

                        {/* Actions */}
                        <td className="py-3 px-4 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                          {isConfirmingDelete ? (
                            <div className="flex items-center justify-end gap-1.5">
                              <span className="text-[10px] text-rose-300 font-bold">Hapus?</span>
                              <button
                                onClick={(e) => handleDeleteSession(s.id, e)}
                                disabled={isDeleting}
                                className="px-2 py-0.5 rounded bg-rose-600 hover:bg-rose-500 text-white text-[10px] font-bold transition-colors"
                              >
                                Ya
                              </button>
                              <button
                                onClick={() => setConfirmDeleteId(null)}
                                className="px-1.5 py-0.5 rounded text-slate-400 hover:text-white text-[10px]"
                              >
                                ✕
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={() => toggleExpand(s.id)}
                                className="p-1.5 rounded-lg text-cyan-400 hover:text-cyan-300 hover:bg-cyan-500/10 transition-colors"
                                title="Lihat Rincian Sesi"
                              >
                                {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                              </button>
                              <button
                                onClick={() => setConfirmDeleteId(s.id)}
                                className="p-1.5 rounded-lg text-rose-400/80 hover:text-rose-300 hover:bg-rose-500/10 transition-colors"
                                title="Hapus Sesi Ini"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>

                      {/* SMART INLINE EXPANDED DETAILS (Collapsible Drawer - No Modal!) */}
                      {isExpanded && (
                        <tr className="bg-[#080d1a] border-b border-cyan-500/20">
                          <td colSpan={9} className="p-4 md:p-6">
                            <div className="space-y-4">
                              {/* Header Title inside drawer */}
                              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
                                <div>
                                  <div className="text-xs text-cyan-400 font-semibold uppercase tracking-wider flex items-center gap-1.5">
                                    <Activity className="h-3.5 w-3.5" /> Rincian Rekam Fisiologis Sesi
                                  </div>
                                  <h4 className="text-base font-bold text-white mt-0.5">{s.title}</h4>
                                  <p className="text-xs font-mono text-slate-400 mt-0.5">
                                    ID: <span className="text-cyan-300">{s.id}</span> | Pasien:{" "}
                                    <span className="text-white">{s.patient_id}</span>
                                  </p>
                                </div>

                                <div className="flex items-center gap-2">
                                  <span
                                    className={`px-3 py-1 rounded-full text-xs font-bold border uppercase tracking-wider ${
                                      s.status === "ACTIVE"
                                        ? "bg-cyan-500/20 text-cyan-300 border-cyan-500/40"
                                        : "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                                    }`}
                                  >
                                    STATUS: {s.status}
                                  </span>
                                  <button
                                    onClick={() => handleDeleteSession(s.id)}
                                    disabled={isDeleting}
                                    className="btn btn-ghost-teal text-xs text-rose-400 border-rose-500/30 hover:bg-rose-500/20 flex items-center gap-1 py-1 px-3"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" /> Hapus Sesi Ini
                                  </button>
                                </div>
                              </div>

                              {/* 4 Detailed Metric Cards */}
                              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                                <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800 space-y-1">
                                  <div className="text-[11px] font-medium text-slate-400 flex items-center gap-1">
                                    <Heart className="h-3.5 w-3.5 text-rose-400" /> Rata-rata BPM
                                  </div>
                                  <div className="text-xl font-bold font-mono text-white">
                                    {s.avg_bpm > 0 ? `${s.avg_bpm}` : "--"}{" "}
                                    <span className="text-xs font-sans text-slate-500">BPM</span>
                                  </div>
                                  <div className="text-[10px] text-slate-500">Denyut nadi rata-rata</div>
                                </div>

                                <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800 space-y-1">
                                  <div className="text-[11px] font-medium text-slate-400 flex items-center gap-1">
                                    <Activity className="h-3.5 w-3.5 text-rose-500" /> Puncak BPM
                                  </div>
                                  <div className="text-xl font-bold font-mono text-rose-400">
                                    {s.peak_bpm > 0 ? `${s.peak_bpm}` : "--"}{" "}
                                    <span className="text-xs font-sans text-slate-500">BPM</span>
                                  </div>
                                  <div className="text-[10px] text-slate-500">Denyut tertinggi terekam</div>
                                </div>

                                <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800 space-y-1">
                                  <div className="text-[11px] font-medium text-slate-400 flex items-center gap-1">
                                    <Sliders className="h-3.5 w-3.5 text-cyan-400" /> Rata-rata GSR
                                  </div>
                                  <div className="text-xl font-bold font-mono text-white">
                                    {s.avg_gsr > 0 ? `${s.avg_gsr}` : "--"}{" "}
                                    <span className="text-xs font-sans text-slate-500">μS</span>
                                  </div>
                                  <div className="text-[10px] text-slate-500">Respon konduktansi kulit</div>
                                </div>

                                <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800 space-y-1">
                                  <div className="text-[11px] font-medium text-slate-400 flex items-center gap-1">
                                    <Zap className="h-3.5 w-3.5 text-amber-400" /> Intervensi Haptik
                                  </div>
                                  <div className="text-xl font-bold font-mono text-amber-400">
                                    {s.alert_count || 0}{" "}
                                    <span className="text-xs font-sans text-slate-500">kali</span>
                                  </div>
                                  <div className="text-[10px] text-slate-500">Stimulus biofeedback aktif</div>
                                </div>
                              </div>

                              {/* Timeline & Notes Grid */}
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                                <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 text-xs space-y-2">
                                  <div className="text-slate-400 font-semibold flex items-center gap-1.5">
                                    <Clock className="h-3.5 w-3.5 text-cyan-400" /> Parameter Waktu & Durasi
                                  </div>
                                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                                    <div>
                                      <span className="text-slate-500 block">Waktu Mulai:</span>
                                      <span className="font-mono text-slate-200">
                                        {new Date(s.start_time).toLocaleString("id-ID")}
                                      </span>
                                    </div>
                                    <div>
                                      <span className="text-slate-500 block">Waktu Selesai:</span>
                                      <span className="font-mono text-slate-200">
                                        {s.end_time ? new Date(s.end_time).toLocaleString("id-ID") : "Sedang berjalan"}
                                      </span>
                                    </div>
                                    <div className="col-span-2">
                                      <span className="text-slate-500 block">Total Durasi Sesi:</span>
                                      <span className="font-mono font-bold text-cyan-300">{durStr} ({s.duration_seconds || 0} detik)</span>
                                    </div>
                                  </div>
                                </div>

                                <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 text-xs space-y-2">
                                  <div className="text-slate-400 font-semibold flex items-center gap-1.5">
                                    <FileText className="h-3.5 w-3.5 text-cyan-400" /> Catatan Klinis / Observasi
                                  </div>
                                  <p className="text-[11px] text-slate-300 leading-relaxed italic bg-slate-900/60 p-2.5 rounded-lg border border-slate-800/80">
                                    {s.notes && s.notes.trim() ? s.notes : "Tidak ada catatan khusus yang dilampirkan untuk sesi monitoring ini."}
                                  </p>
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/40 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400">
          <div>
            Menampilkan <span className="font-bold text-white">{rows.length > 0 ? (page - 1) * PAGE + 1 : 0}</span> sampai{" "}
            <span className="font-bold text-white">{Math.min(page * PAGE, rows.length)}</span> dari{" "}
            <span className="font-bold text-white">{rows.length}</span> sesi
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="p-1.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-300 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>

            <span className="px-3 py-1 font-mono text-white text-xs">
              Halaman {page} dari {totalPages}
            </span>

            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="p-1.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-300 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </Panel>
    </div>
  );
}
