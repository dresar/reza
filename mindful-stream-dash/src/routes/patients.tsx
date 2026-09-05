import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { Search, Plus, X, User, Heart, Activity } from "lucide-react";
import { Panel } from "@/components/Panel";
import { InfoTooltip } from "@/components/InfoTooltip";
import { api, Patient } from "@/services/api";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/patients")({
  head: () => ({ meta: [{ title: "Data Pasien — ADHD Biofeedback" }] }),
  component: Patients,
});

function Patients() {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<Patient | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newPatient, setNewPatient] = useState({
    name: "",
    nickname: "",
    age: 8,
    gender: "Laki-laki",
    adhd_subtype: "Combined Type",
    baseline_gsr: 3.5,
    baseline_bpm: 80,
    notes: "",
  });

  const loadPatients = () => {
    api.getPatients().then(setPatients).catch(console.error);
  };

  useEffect(() => {
    loadPatients();
  }, []);

  const handleAddPatient = async () => {
    if (!newPatient.name) {
      toast.error("Nama anak wajib diisi");
      return;
    }
    try {
      await api.savePatient(newPatient);
      toast.success(`Profil ${newPatient.name} tersimpan!`);
      setShowAddModal(false);
      setNewPatient({
        name: "",
        nickname: "",
        age: 8,
        gender: "Laki-laki",
        adhd_subtype: "Combined Type",
        baseline_gsr: 3.5,
        baseline_bpm: 80,
        notes: "",
      });
      loadPatients();
    } catch (e) {
      toast.error("Gagal menambahkan pasien");
    }
  };

  const filtered = patients.filter((p) =>
    (p.name || "").toLowerCase().includes(q.toLowerCase()) ||
    (p.nickname || "").toLowerCase().includes(q.toLowerCase())
  );

  return (
    <div className="space-y-5 max-w-[1500px] mx-auto pb-8">
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cari subjek anak..."
            className="input-field pl-10 w-full"
          />
        </div>
        <button
          className="btn btn-primary"
          onClick={() => setShowAddModal(true)}
        >
          <Plus className="h-4 w-4 mr-1" /> Tambah Subjek
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        {filtered.map((p) => (
          <div
            key={p.id}
            className="glass-card p-5 transition-all duration-200 hover:-translate-y-1 hover:shadow-[0_12px_40px_rgba(0,0,0,0.5)] border border-border/80"
          >
            <div className="flex items-center gap-3">
              <div
                className="h-12 w-12 rounded-full flex items-center justify-center font-bold text-base shrink-0"
                style={{
                  background: `linear-gradient(135deg, ${p.avatar_color || "#00D4FF"}, #A78BFA)`,
                  color: "#0B0F1A",
                }}
              >
                {(p.nickname || p.name || "A").slice(0, 2).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-foreground text-sm truncate">{p.name}</div>
                <div className="text-xs text-muted-foreground mono">
                  {p.age} Thn · {p.gender}
                </div>
              </div>
              <span className="chip chip-emerald text-[10px]">
                AKTIF
              </span>
            </div>

            <div className="flex flex-wrap gap-1.5 mt-3">
              <span className="chip chip-violet text-[10px]">{p.adhd_subtype}</span>
              <span className="chip chip-blue text-[10px]">GSR: {p.baseline_gsr} μS</span>
            </div>

            <div className="mt-3 p-2.5 rounded-lg bg-white/[0.02] border border-border/60 text-xs text-muted-foreground">
              <p className="line-clamp-2">{p.notes || "Tidak ada catatan khusus."}</p>
            </div>

            <div className="grid grid-cols-2 gap-2 mt-4">
              <button className="btn text-xs py-1.5" onClick={() => setOpen(p)}>
                Detail
              </button>
              <button
                className="btn btn-primary text-xs py-1.5"
                onClick={() => {
                  toast.success(`Subjek ${p.name} dipilih.`);
                }}
              >
                Pilih
              </button>
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="col-span-full py-12 text-center space-y-2 bg-[#0B0F1E] rounded-2xl border border-[#1E293B]">
            <User className="h-10 w-10 mx-auto text-slate-600" />
            <div className="text-sm font-bold text-white">Belum Ada Subjek Terdaftar</div>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              Tambahkan data subjek anak ADHD untuk memulai sesi pemantauan.
            </p>
          </div>
        )}
      </div>

      {/* Detail Drawer */}
      <div
        className="fixed inset-0 z-50 transition-opacity duration-200"
        style={{
          pointerEvents: open ? "auto" : "none",
          opacity: open ? 1 : 0,
          background: "rgba(0,0,0,0.6)",
        }}
        onClick={() => setOpen(null)}
      />
      <aside
        className="fixed top-0 right-0 z-50 h-screen w-[400px] max-w-full transition-transform duration-300"
        style={{
          transform: open ? "translateX(0)" : "translateX(100%)",
          background: "#0E1424",
          borderLeft: "1px solid #243050",
        }}
      >
        {open && (
          <div className="h-full flex flex-col">
            <header className="h-14 flex items-center justify-between px-5 border-b border-border">
              <h3 className="font-bold text-sm">Profil Subjek</h3>
              <button className="btn p-1.5" onClick={() => setOpen(null)}>
                <X className="h-4 w-4" />
              </button>
            </header>
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              <div className="flex items-center gap-3">
                <div
                  className="h-14 w-14 rounded-full flex items-center justify-center font-bold text-lg shrink-0"
                  style={{
                    background: `linear-gradient(135deg, ${open.avatar_color || "#00D4FF"}, #A78BFA)`,
                    color: "#0B0F1A",
                  }}
                >
                  {(open.nickname || open.name).slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <div className="text-base font-bold">{open.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {open.age} Thn · {open.gender} · {open.adhd_subtype}
                  </div>
                </div>
              </div>

              <Panel title="Baseline Fisiologis">
                <Row k="ID" v={open.id} />
                <Row k="ID Perangkat" v={open.device_id || "esp32-band-001"} />
                <Row k="Baseline GSR" v={`${open.baseline_gsr} μS`} />
                <Row k="Baseline BPM" v={`${open.baseline_bpm} BPM`} />
                <Row k="Tipe ADHD" v={open.adhd_subtype} />
              </Panel>

              <Panel title="Akses Orang Tua / Wali">
                <Row k="Nama Orang Tua" v={open.parent_name || "Bunda Siti Rahmawati"} />
                <Row k="Email Kontak" v={open.parent_email || "ortu.bunda@gmail.com"} />
                <Row k="No. WhatsApp" v={open.parent_phone || "+62 821-9876-5432"} />
              </Panel>

              <Panel title="Catatan Observasi">
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {open.notes || "Subjek menunjukkan respon positif terhadap getaran biofeedback."}
                </p>
              </Panel>
            </div>
          </div>
        )}
      </aside>

      {/* Modal Add Patient */}
      <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
        <DialogContent className="bg-[#0E1424] border-border text-foreground max-w-md">
          <DialogHeader>
            <DialogTitle>Tambah Subjek Anak</DialogTitle>
          </DialogHeader>
          <div className="space-y-3.5 py-2 text-sm">
            <div>
              <Label>Nama Lengkap</Label>
              <Input
                value={newPatient.name}
                onChange={(e) => setNewPatient({ ...newPatient, name: e.target.value })}
                placeholder="Nama anak"
                className="bg-black/30 border-border mt-1"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Panggilan</Label>
                <Input
                  value={newPatient.nickname}
                  onChange={(e) => setNewPatient({ ...newPatient, nickname: e.target.value })}
                  placeholder="Nama panggilan"
                  className="bg-black/30 border-border mt-1"
                />
              </div>
              <div>
                <Label>Usia (Tahun)</Label>
                <Input
                  type="number"
                  value={newPatient.age}
                  onChange={(e) => setNewPatient({ ...newPatient, age: parseInt(e.target.value) || 8 })}
                  className="bg-black/30 border-border mt-1"
                />
              </div>
            </div>
            <div>
              <Label>Subtipe ADHD</Label>
              <Select
                value={newPatient.adhd_subtype}
                onValueChange={(val) => setNewPatient({ ...newPatient, adhd_subtype: val })}
              >
                <SelectTrigger className="bg-black/30 border-border mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Combined Type">Combined Type (Campuran)</SelectItem>
                  <SelectItem value="Predominantly Hyperactive-Impulsive">Hiperaktif-Impulsif</SelectItem>
                  <SelectItem value="Predominantly Inattentive">Inatensi (Kurang Perhatian)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Baseline GSR (μS)</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={newPatient.baseline_gsr}
                  onChange={(e) => setNewPatient({ ...newPatient, baseline_gsr: parseFloat(e.target.value) || 3.5 })}
                  className="bg-black/30 border-border mt-1"
                />
              </div>
              <div>
                <Label>Baseline BPM</Label>
                <Input
                  type="number"
                  value={newPatient.baseline_bpm}
                  onChange={(e) => setNewPatient({ ...newPatient, baseline_bpm: parseInt(e.target.value) || 80 })}
                  className="bg-black/30 border-border mt-1"
                />
              </div>
            </div>
            <div className="border-t border-border/60 pt-3 space-y-3">
              <div className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                <span>Informasi Orang Tua / Wali</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Nama Orang Tua</Label>
                  <Input
                    value={(newPatient as any).parent_name || ""}
                    onChange={(e) => setNewPatient({ ...newPatient, parent_name: e.target.value } as any)}
                    placeholder="Bunda / Ayah"
                    className="bg-black/30 border-border mt-1"
                  />
                </div>
                <div>
                  <Label>Email Orang Tua</Label>
                  <Input
                    type="email"
                    value={(newPatient as any).parent_email || ""}
                    onChange={(e) => setNewPatient({ ...newPatient, parent_email: e.target.value } as any)}
                    placeholder="email@ortu.com"
                    className="bg-black/30 border-border mt-1"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>No. WhatsApp / HP</Label>
                  <Input
                    value={(newPatient as any).parent_phone || ""}
                    onChange={(e) => setNewPatient({ ...newPatient, parent_phone: e.target.value } as any)}
                    placeholder="0812xxxx"
                    className="bg-black/30 border-border mt-1"
                  />
                </div>
                <div>
                  <Label>ID Gelang ESP32</Label>
                  <Input
                    value={(newPatient as any).device_id || "esp32-band-001"}
                    onChange={(e) => setNewPatient({ ...newPatient, device_id: e.target.value } as any)}
                    placeholder="esp32-band-001"
                    className="bg-black/30 border-border mt-1 font-mono"
                  />
                </div>
              </div>
            </div>

            <div>
              <Label>Catatan Observasi / Perilaku</Label>
              <Input
                value={newPatient.notes}
                onChange={(e) => setNewPatient({ ...newPatient, notes: e.target.value })}
                placeholder="Catatan perilaku anak..."
                className="bg-black/30 border-border mt-1"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddModal(false)}>
              Batal
            </Button>
            <Button onClick={handleAddPatient}>Simpan Subjek</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between py-1.5 text-xs border-b border-border/40 last:border-0">
      <span className="text-muted-foreground">{k}</span>
      <span className="mono font-semibold text-foreground">{v}</span>
    </div>
  );
}

