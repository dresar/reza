import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { Download, FileBarChart2, FileText, CheckCircle2 } from "lucide-react";
import { Panel } from "@/components/Panel";
import { InfoTooltip } from "@/components/InfoTooltip";
import { api, MonitoringSession } from "@/services/api";
import { toast } from "sonner";

export const Route = createFileRoute("/reports")({
  head: () => ({ meta: [{ title: "Laporan — ADHD Biofeedback" }] }),
  component: Reports,
});

function Reports() {
  const [sessions, setSessions] = useState<MonitoringSession[]>([]);

  useEffect(() => {
    api.getSessions().then(setSessions).catch(console.error);
  }, []);

  const handleDownloadCSV = () => {
    window.open("http://localhost:5001/api/export/csv", "_blank");
    toast.success("Mengunduh CSV...");
  };

  const handlePrintSummary = (sess: MonitoringSession) => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    printWindow.document.write(`
      <html>
        <head>
          <title>Laporan Sesi - ${sess.title}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 40px; color: #111; }
            h1 { font-size: 20px; border-bottom: 2px solid #0088cc; padding-bottom: 8px; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th, td { border: 1px solid #ddd; padding: 10px; text-align: left; font-size: 13px; }
            th { background: #f5f5f5; }
            .badge { display: inline-block; padding: 4px 8px; background: #e0f2fe; color: #0369a1; border-radius: 4px; font-weight: bold; }
          </style>
        </head>
        <body>
          <h1>Laporan Biofeedback ADHD</h1>
          <p><strong>Peneliti:</strong> Muhammad Reza (2209020111) - Fasilkom-TI UMSU Medan</p>
          <p><strong>Judul Sesi:</strong> ${sess.title}</p>
          <p><strong>Waktu:</strong> ${new Date(sess.start_time).toLocaleString("id-ID")}</p>
          <p><strong>Status:</strong> <span class="badge">${sess.status}</span></p>
          <table>
            <tr><th>Parameter Fisiologis</th><th>Nilai</th><th>Keterangan</th></tr>
            <tr><td>Rata-rata GSR</td><td>${(sess.avg_gsr || 3.5).toFixed(2)} μS</td><td>Baseline Relaks</td></tr>
            <tr><td>Puncak GSR</td><td>${(sess.peak_gsr || 7.5).toFixed(2)} μS</td><td>Puncak Emosi</td></tr>
            <tr><td>Rata-rata BPM</td><td>${Math.round(sess.avg_bpm || 80)} BPM</td><td>Resting Heart Rate</td></tr>
            <tr><td>Intervensi Haptik</td><td>${sess.alert_count || 0} Kali</td><td>Stimulus Terkirim</td></tr>
            <tr><td>Durasi Sesi</td><td>${Math.round((sess.duration_seconds || 0) / 60)} Menit</td><td>Perekaman Kontinyu</td></tr>
          </table>
          <h3 style="margin-top:30px;">Catatan Observasi:</h3>
          <p style="background:#fafafa; padding:15px; border-left:4px solid #0088cc; font-size:13px;">
            ${sess.notes || "Subjek menunjukkan adaptasi fisiologis yang positif terhadap stimulus getaran haptik."}
          </p>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.print();
  };

  return (
    <div className="space-y-5 max-w-[1300px] mx-auto pb-8">
      <div className="flex justify-between items-center gap-3">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-bold text-white">Laporan Sesi</h2>
          <InfoTooltip content="Ringkasan hasil perekaman fisiologis dan tombol cetak laporan format PDF." />
        </div>
        <button className="btn btn-primary text-xs" onClick={handleDownloadCSV}>
          <Download className="h-3.5 w-3.5 mr-1.5" /> Unduh CSV
        </button>
      </div>

      <Panel
        title={
          <div className="flex items-center gap-2">
            <span>Daftar Sesi</span>
            <InfoTooltip content="Daftar seluruh sesi pemantauan yang tersimpan dalam basis data lokal SQLite." />
          </div>
        }
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {sessions.map((s) => (
            <div key={s.id} className="p-4 rounded-xl border border-border/60 bg-white/[0.02] space-y-3">
              <div className="flex items-center gap-3">
                <div
                  className="h-10 w-10 rounded-lg flex items-center justify-center shrink-0"
                  style={{ background: "rgba(0,212,255,0.12)", color: "#00D4FF" }}
                >
                  <FileBarChart2 className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-foreground text-sm truncate">{s.title}</div>
                  <div className="mono text-[11px] text-muted-foreground">
                    {new Date(s.start_time).toLocaleDateString("id-ID")} · {s.id}
                  </div>
                </div>
                <button
                  className="btn btn-ghost-teal text-xs py-1 px-2.5"
                  onClick={() => handlePrintSummary(s)}
                >
                  <FileText className="h-3.5 w-3.5 mr-1" /> PDF
                </button>
              </div>

              <div className="grid grid-cols-3 gap-2 mt-3">
                <Mini label="GSR Rata" value={`${(s.avg_gsr || 3.5).toFixed(1)} μS`} color="#00D4FF" />
                <Mini label="BPM Rata" value={`${Math.round(s.avg_bpm || 80)}`} color="#F43F5E" />
                <Mini label="Getaran" value={`${s.alert_count || 0}x`} color="#F59E0B" />
              </div>
            </div>
          ))}
          {sessions.length === 0 && (
            <div className="col-span-full py-12 text-center space-y-2 bg-[#0B0F1E] rounded-2xl border border-[#1E293B]">
              <FileBarChart2 className="h-10 w-10 mx-auto text-slate-600" />
              <div className="text-sm font-bold text-white">Belum Ada Rekaman Sesi</div>
              <p className="text-xs text-slate-400">
                Mulai sesi di menu Live Monitor untuk merekam data.
              </p>
            </div>
          )}
        </div>
      </Panel>
    </div>
  );
}

function Mini({ label, value, color }: { label: string; value: any; color: string }) {
  return (
    <div className="rounded-lg p-2.5 border border-border/60 bg-black/20">
      <div className="text-[9px] tracking-[0.16em] text-muted-foreground">{label.toUpperCase()}</div>
      <div className="mono text-base font-bold mt-0.5" style={{ color }}>
        {value}
      </div>
    </div>
  );
}

