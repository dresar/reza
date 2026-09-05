import { createFileRoute } from "@tanstack/react-router";
import { useState, useRef, useEffect, useMemo } from "react";
import {
  Terminal,
  Send,
  Trash2,
  ArrowDownCircle,
  RefreshCw,
  Radio,
  Zap,
  Cpu,
  Search,
  Copy,
  Check,
  ChevronDown,
  ChevronRight,
  Code2,
  Activity,
} from "lucide-react";
import { InfoTooltip } from "@/components/InfoTooltip";
import { useRealtimeStream } from "@/hooks/useRealtimeStream";
import { toast } from "sonner";

export const Route = createFileRoute("/serial")({
  head: () => ({ meta: [{ title: "Serial Monitor — ADHD Biofeedback" }] }),
  component: SerialMonitorPage,
});

type ViewMode = "CLEAN" | "RAW";

interface ParsedPacket {
  isJson: boolean;
  type: "TELEMETRY" | "DIAGNOSTIC" | "ALERT" | "CMD" | "SERIAL" | "RAW";
  summary: string;
  badge: { label: string; color: string };
  rawJson?: any;
}

function parseLogPayload(topic: string, payload: string): ParsedPacket {
  try {
    const trimmed = payload.trim();
    if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
      const obj = JSON.parse(trimmed);

      // 1. Telemetri Sensor
      if (obj.gsr || obj.ppg || obj.imu || topic.includes("telemetry")) {
        const gsrVal = obj.gsr?.microsiemens !== undefined ? `${Number(obj.gsr.microsiemens).toFixed(2)} μS` : "--";
        const gsrRaw = obj.gsr?.raw !== undefined ? `(Raw ${obj.gsr.raw})` : "";
        const bpmVal = obj.ppg?.bpm ? `${Number(obj.ppg.bpm).toFixed(0)} BPM` : "--";
        const fidgetVal = obj.imu?.fidget_score !== undefined ? `${obj.imu.fidget_score}%` : "--";
        const batVal = obj.battery?.percentage !== undefined ? `${obj.battery.percentage}%` : "--";
        return {
          isJson: true,
          type: "TELEMETRY",
          badge: { label: "TELEMETRI", color: "bg-cyan-500/10 text-cyan-400 border-cyan-500/30" },
          summary: `GSR: ${gsrVal} ${gsrRaw}  |  PPG: ${bpmVal}  |  Fidget: ${fidgetVal}  |  Bat: ${batVal}`,
          rawJson: obj,
        };
      }

      // 2. Alert / Disregulasi
      if (obj.event || obj.disregulation_type || topic.includes("events")) {
        const type = obj.disregulation_type || obj.event || "DISREGULASI";
        const conf = obj.confidence ? `(Akurasi: ${obj.confidence}%)` : "";
        const haptic = obj.haptic_action ? `-> Getar: ${obj.haptic_action}` : "";
        return {
          isJson: true,
          type: "ALERT",
          badge: { label: "INTERVENSI", color: "bg-amber-500/15 text-amber-300 border-amber-500/40" },
          summary: `${type} terdeteksi ${conf} ${haptic}`,
          rawJson: obj,
        };
      }

      // 3. Self Test / Diagnostik
      if (obj.test || obj.diagnostics || obj.system) {
        const gsrSt = obj.diagnostics?.gsr || obj.gsr_status || "OK";
        const ppgSt = obj.diagnostics?.ppg || obj.ppg_status || "OK";
        const imuSt = obj.diagnostics?.imu || obj.imu_status || "OK";
        const motorSt = obj.diagnostics?.motor || obj.motor_status || "OK";
        return {
          isJson: true,
          type: "DIAGNOSTIC",
          badge: { label: "DIAGNOSTIK", color: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40" },
          summary: `Self-Test: GSR [${gsrSt}], PPG [${ppgSt}], IMU [${imuSt}], Haptic [${motorSt}]`,
          rawJson: obj,
        };
      }

      // JSON Lainnya
      return {
        isJson: true,
        type: "RAW",
        badge: { label: "JSON", color: "bg-slate-700/50 text-slate-300 border-slate-600" },
        summary: JSON.stringify(obj).slice(0, 100) + (JSON.stringify(obj).length > 100 ? "..." : ""),
        rawJson: obj,
      };
    }
  } catch (e) {
    // Non-JSON
  }

  // Teks Polos Serial / Debug
  if (payload.includes("BOOT") || payload.includes("ESP32") || payload.includes("INIT")) {
    return {
      isJson: false,
      type: "DIAGNOSTIC",
      badge: { label: "BOOT", color: "bg-purple-500/15 text-purple-300 border-purple-500/40" },
      summary: payload,
    };
  }

  if (payload.includes("FAIL") || payload.includes("ERR") || payload.includes("TIMEOUT")) {
    return {
      isJson: false,
      type: "ALERT",
      badge: { label: "ERROR", color: "bg-rose-500/15 text-rose-300 border-rose-500/40" },
      summary: payload,
    };
  }

  return {
    isJson: false,
    type: "SERIAL",
    badge: { label: "DEBUG", color: "bg-slate-800 text-slate-400 border-slate-700" },
    summary: payload,
  };
}

function SerialMonitorPage() {
  const { serialLogs, sendSerialCommand, clearSerialLogs, isConnected, mqttConnected } = useRealtimeStream();
  const [commandInput, setCommandInput] = useState("");
  const [filterTopic, setFilterTopic] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [viewMode, setViewMode] = useState<ViewMode>("CLEAN");
  const [autoScroll, setAutoScroll] = useState<boolean>(true);
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({});
  const [copied, setCopied] = useState(false);
  const [newLogCountWhileScrolled, setNewLogCountWhileScrolled] = useState(0);

  const terminalScrollRef = useRef<HTMLDivElement | null>(null);
  const isUserScrollingRef = useRef(false);

  useEffect(() => {
    if (!terminalScrollRef.current) return;
    if (autoScroll && !isUserScrollingRef.current) {
      terminalScrollRef.current.scrollTop = terminalScrollRef.current.scrollHeight;
      setNewLogCountWhileScrolled(0);
    } else if (isUserScrollingRef.current) {
      setNewLogCountWhileScrolled((prev) => prev + 1);
    }
  }, [serialLogs, autoScroll]);

  const handleScroll = () => {
    if (!terminalScrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = terminalScrollRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 35;

    if (isAtBottom) {
      isUserScrollingRef.current = false;
      setNewLogCountWhileScrolled(0);
    } else {
      isUserScrollingRef.current = true;
    }
  };

  const scrollToBottom = () => {
    if (terminalScrollRef.current) {
      terminalScrollRef.current.scrollTop = terminalScrollRef.current.scrollHeight;
      isUserScrollingRef.current = false;
      setNewLogCountWhileScrolled(0);
    }
  };

  const handleSendCommand = (cmdToSend?: string) => {
    const cmd = (cmdToSend || commandInput).trim();
    if (!cmd) return;
    sendSerialCommand(cmd);
    toast.success(`Perintah "${cmd}" terkirim.`);
    setCommandInput("");
  };

  const toggleExpand = (id: string) => {
    setExpandedItems((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleCopyLogs = () => {
    const text = filteredLogs.map((l) => `[${l.timeStr}] [${l.topic}] ${l.payload}`).join("\n");
    navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success("Log tersalin.");
    setTimeout(() => setCopied(false), 2000);
  };

  const filteredLogs = useMemo(() => {
    return serialLogs.filter((log) => {
      if (filterTopic === "TELEMETRY" && !log.topic.includes("telemetry") && !log.topic.includes("sensors")) return false;
      if (filterTopic === "EVENTS" && !log.topic.includes("events") && !log.topic.includes("alerts")) return false;
      if (filterTopic === "CMD" && !log.topic.includes("cmd") && log.level !== "CMD") return false;
      if (filterTopic === "SERIAL" && !log.topic.includes("serial")) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        if (!log.payload.toLowerCase().includes(q) && !log.topic.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [serialLogs, filterTopic, searchQuery]);

  return (
    <div className="space-y-4 max-w-[1600px] mx-auto pb-8">
      {/* Top Header */}
      <div className="p-4 rounded-2xl bg-[#0B0F1E] border border-[#1E293B] shadow-lg flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 shrink-0">
            <Terminal className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-bold text-sm text-white">Serial Monitor & Raw MQTT</h2>
              <span className="px-2 py-0.5 rounded-full text-[9px] font-mono font-bold bg-cyan-500/10 text-cyan-300 border border-cyan-500/30">
                115200 BAUD
              </span>
              <InfoTooltip content="Pemantauan paket telemetri mentah, topik MQTT broker, dan eksekusi instruksi konsol ESP32." />
            </div>
            <p className="text-xs text-slate-400 mt-0.5">Stream log serial & paket data ESP32 realtime.</p>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center p-1 rounded-lg bg-slate-900 border border-slate-800 text-xs">
            <button
              onClick={() => setViewMode("CLEAN")}
              className={`px-3 py-1 rounded-md font-semibold transition-colors flex items-center gap-1.5 ${
                viewMode === "CLEAN" ? "bg-cyan-500 text-slate-950 font-bold" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Activity className="h-3.5 w-3.5" /> Bersih
            </button>
            <button
              onClick={() => setViewMode("RAW")}
              className={`px-3 py-1 rounded-md font-semibold transition-colors flex items-center gap-1.5 ${
                viewMode === "RAW" ? "bg-cyan-500 text-slate-950 font-bold" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Code2 className="h-3.5 w-3.5" /> JSON Mentah
            </button>
          </div>

          <button
            onClick={() => setAutoScroll(!autoScroll)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors flex items-center gap-1.5 ${
              autoScroll ? "bg-cyan-500/15 text-cyan-300 border-cyan-500/40" : "bg-slate-900 text-slate-400 border-slate-800"
            }`}
          >
            <ArrowDownCircle className="h-3.5 w-3.5" /> Auto-Scroll: {autoScroll ? "ON" : "OFF"}
          </button>

          <button
            onClick={handleCopyLogs}
            disabled={filteredLogs.length === 0}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-900 text-slate-300 hover:text-white border border-slate-800 disabled:opacity-30 flex items-center gap-1.5"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
            Salin
          </button>

          <button
            onClick={clearSerialLogs}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-900 text-slate-400 hover:text-rose-400 border border-slate-800 flex items-center gap-1.5"
          >
            <Trash2 className="h-3.5 w-3.5" /> Bersihkan
          </button>
        </div>
      </div>

      {/* Quick Action Bar */}
      <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800 flex items-center justify-between gap-3 flex-wrap">
        <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
          <Zap className="h-3.5 w-3.5 text-amber-400" /> Uji Cepat ESP32:
        </span>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => handleSendCommand("t")}
            className="px-3 py-1.5 rounded-lg bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 border border-cyan-500/40 text-xs font-bold font-mono transition-colors flex items-center gap-1.5"
          >
            <Cpu className="h-3.5 w-3.5" /> Self-Test ('t')
          </button>
          <button
            onClick={() => handleSendCommand("1")}
            className="px-3 py-1.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/40 text-xs font-bold font-mono transition-colors flex items-center gap-1.5"
          >
            <Zap className="h-3.5 w-3.5 text-amber-400" /> Uji Getar ('1')
          </button>
          <button
            onClick={() => handleSendCommand("2")}
            className="px-3 py-1.5 rounded-lg bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 border border-cyan-500/40 text-xs font-bold font-mono transition-colors"
          >
            🧪 GSR ('2')
          </button>
          <button
            onClick={() => handleSendCommand("3")}
            className="px-3 py-1.5 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/40 text-xs font-bold font-mono transition-colors"
          >
            ❤️ PPG ('3')
          </button>
          <button
            onClick={() => handleSendCommand("4")}
            className="px-3 py-1.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/40 text-xs font-bold font-mono transition-colors"
          >
            🧭 IMU ('4')
          </button>
          <button
            onClick={() => handleSendCommand("r")}
            className="px-3 py-1.5 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/40 text-xs font-bold font-mono transition-colors flex items-center gap-1.5"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Restart ('r')
          </button>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs">
          <button
            onClick={() => setFilterTopic("ALL")}
            className={`px-2.5 py-1 rounded font-medium transition-colors ${
              filterTopic === "ALL" ? "bg-cyan-500 text-slate-950 font-bold" : "text-slate-400 hover:text-white"
            }`}
          >
            Semua ({serialLogs.length})
          </button>
          <button
            onClick={() => setFilterTopic("TELEMETRY")}
            className={`px-2.5 py-1 rounded font-medium transition-colors ${
              filterTopic === "TELEMETRY" ? "bg-cyan-500 text-slate-950 font-bold" : "text-slate-400 hover:text-white"
            }`}
          >
            Data Sensor
          </button>
          <button
            onClick={() => setFilterTopic("EVENTS")}
            className={`px-2.5 py-1 rounded font-medium transition-colors ${
              filterTopic === "EVENTS" ? "bg-cyan-500 text-slate-950 font-bold" : "text-slate-400 hover:text-white"
            }`}
          >
            Alarm
          </button>
          <button
            onClick={() => setFilterTopic("CMD")}
            className={`px-2.5 py-1 rounded font-medium transition-colors ${
              filterTopic === "CMD" ? "bg-cyan-500 text-slate-950 font-bold" : "text-slate-400 hover:text-white"
            }`}
          >
            Perintah
          </button>
          <button
            onClick={() => setFilterTopic("SERIAL")}
            className={`px-2.5 py-1 rounded font-medium transition-colors ${
              filterTopic === "SERIAL" ? "bg-cyan-500 text-slate-950 font-bold" : "text-slate-400 hover:text-white"
            }`}
          >
            Debug Serial
          </button>
        </div>

        {/* Search */}
        <div className="relative min-w-[240px]">
          <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari log..."
            className="w-full pl-9 pr-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-cyan-500/50"
          />
        </div>
      </div>

      {/* Terminal Screen Console */}
      <div className="relative rounded-2xl border border-slate-800 bg-[#050811] shadow-2xl overflow-hidden flex flex-col h-[540px]">
        {/* Terminal Titlebar */}
        <div className="px-4 py-2.5 bg-[#090D1A] border-b border-slate-800 flex items-center justify-between select-none">
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-full bg-rose-500/80 inline-block" />
            <span className="h-3 w-3 rounded-full bg-amber-500/80 inline-block" />
            <span className="h-3 w-3 rounded-full bg-emerald-500/80 inline-block" />
            <span className="ml-2 font-mono text-xs text-slate-300 font-semibold">
              ESP32-C3 Serial Terminal • broker.emqx.io:1883
            </span>
          </div>
          <span className="font-mono text-[11px] text-cyan-400 flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            {isConnected ? "WS STREAM ACTIVE" : "DISCONNECTED"}
          </span>
        </div>

        {/* Logs Output */}
        <div
          ref={terminalScrollRef}
          onScroll={handleScroll}
          className="flex-1 p-3 font-mono text-xs overflow-y-auto space-y-1 custom-scrollbar bg-[#050811]"
        >
          {filteredLogs.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-600 space-y-2">
              <Terminal className="h-8 w-8 text-slate-700" />
              <div className="text-slate-400 font-medium">Menunggu stream data ESP32...</div>
            </div>
          ) : (
            filteredLogs.map((log) => {
              const parsed = parseLogPayload(log.topic, log.payload);
              const isExpanded = !!expandedItems[log.id];

              if (viewMode === "CLEAN") {
                return (
                  <div
                    key={log.id}
                    className="p-1.5 rounded bg-slate-900/30 hover:bg-slate-900/70 border border-slate-900/80 transition-colors"
                  >
                    <div className="flex items-start gap-2 leading-relaxed">
                      <span className="text-slate-500 shrink-0 select-none text-[11px]">[{log.timeStr}]</span>
                      <span className={`px-1.5 py-0.2 rounded text-[9px] font-bold shrink-0 border ${parsed.badge.color}`}>
                        {parsed.badge.label}
                      </span>
                      <span
                        className={`flex-1 font-mono text-[11px] ${
                          parsed.type === "ALERT"
                            ? "text-amber-300 font-bold"
                            : parsed.type === "DIAGNOSTIC"
                            ? "text-emerald-300 font-semibold"
                            : parsed.type === "CMD"
                            ? "text-cyan-300 font-bold"
                            : parsed.type === "SERIAL"
                            ? "text-emerald-400 font-semibold"
                            : "text-slate-300"
                        }`}
                      >
                        {parsed.summary}
                      </span>

                      {parsed.isJson && (
                        <button
                          onClick={() => toggleExpand(log.id)}
                          className="shrink-0 text-[10px] text-slate-500 hover:text-cyan-300 px-1.5 py-0.5 rounded bg-slate-800/80 border border-slate-700/60 flex items-center gap-1"
                        >
                          {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />} JSON
                        </button>
                      )}
                    </div>

                    {isExpanded && parsed.rawJson && (
                      <div className="mt-2 p-2.5 rounded bg-[#02040A] border border-slate-800 text-[10px] text-cyan-300 overflow-x-auto">
                        <pre>{JSON.stringify(parsed.rawJson, null, 2)}</pre>
                      </div>
                    )}
                  </div>
                );
              }

              // RAW MODE
              return (
                <div key={log.id} className="flex items-start gap-2 leading-relaxed hover:bg-slate-900/40 p-1 rounded">
                  <span className="text-slate-500 shrink-0 select-none text-[11px]">[{log.timeStr}]</span>
                  <span className="text-purple-400 shrink-0 max-w-[240px] truncate text-[11px] font-bold">
                    {log.topic}
                  </span>
                  <span className="text-slate-600 select-none">»</span>
                  <span className="flex-1 break-all text-slate-300 text-[11px]">{log.payload}</span>
                </div>
              );
            })
          )}
        </div>

        {/* Scroll To Bottom Button */}
        {newLogCountWhileScrolled > 0 && (
          <button
            onClick={scrollToBottom}
            className="absolute bottom-16 right-6 px-3 py-1.5 rounded-full bg-cyan-500 text-slate-950 font-bold text-xs shadow-lg flex items-center gap-1.5 hover:bg-cyan-400 transition-transform active:scale-95 animate-bounce z-10"
          >
            <ArrowDownCircle className="h-4 w-4" />
            <span>{newLogCountWhileScrolled} Log Baru</span>
          </button>
        )}

        {/* Command Input Bar */}
        <div className="p-3 bg-[#090D1A] border-t border-slate-800 flex items-center gap-2">
          <span className="font-mono text-cyan-400 font-bold pl-2 select-none">&gt;</span>
          <input
            type="text"
            value={commandInput}
            onChange={(e) => setCommandInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSendCommand();
            }}
            placeholder="Ketik perintah (t, 1, 2, 3, 4, r, PING)..."
            className="flex-1 bg-transparent text-xs font-mono text-slate-200 placeholder:text-slate-600 focus:outline-none"
          />
          <button
            onClick={() => handleSendCommand()}
            className="px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 transition-colors shrink-0 shadow-md"
          >
            <Send className="h-3.5 w-3.5" />
            <span>Kirim</span>
          </button>
        </div>
      </div>
    </div>
  );
}
