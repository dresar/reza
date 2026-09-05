/**
 * ============================================================================
 * ADHD Wearable IoT — Backend Biofeedback Decision Engine Types
 * Peneliti: Muhammad Reza (2209020111) — TI Fasilkom-TI UMSU 2026
 * ============================================================================
 * Tipe data yang digunakan oleh BiofeedbackDecisionEngine.
 * Mengikuti terminologi proposal skripsi (berbasis thresholding, bukan diagnosis).
 */

// ======================== LEVEL PER SENSOR ========================

/**
 * Level klasifikasi per sensor.
 * 0 = Normal, 1 = Warning (peningkatan), 2 = Critical (disregulasi)
 */
export type SensorLevel = 0 | 1 | 2;

/**
 * Hasil analisis sinyal GSR (Galvanic Skin Response / Konduktansi Kulit)
 */
export interface GSRAnalysis {
  raw_us: number;          // Nilai µS mentah dari sensor
  ema_us: number;          // Nilai setelah EMA filter
  slope_us_per_s: number;  // Laju perubahan GSR (µS/detik)
  change_pct: number;      // Perubahan persen dari baseline
  level: SensorLevel;
  label: 'Normal' | 'Peningkatan Aktivitas' | 'Indikasi Disregulasi' | 'Belum Terpasang';
  score: number;           // 0–100 normalized score
  is_attached?: boolean;
}

/**
 * Hasil analisis sinyal PPG/BPM (Denyut Nadi)
 */
export interface BPMAnalysis {
  bpm: number;
  ema_bpm: number;
  hrv_rmssd: number;       // HRV — semakin rendah = semakin stres
  deviation_from_baseline: number; // BPM - baseline_bpm
  level: SensorLevel;
  label: 'Normal' | 'Peningkatan Aktivitas' | 'Indikasi Disregulasi';
  score: number;
}

/**
 * Hasil analisis sinyal IMU / Gerak Tubuh (MPU6050)
 */
export interface IMUAnalysis {
  fidget_score: number;
  accel_magnitude: number;
  gyro_energy: number;       // ||gx|| + ||gy|| + ||gz||
  movement_entropy: number;  // Keacakan gerakan (0 = monoton, 1 = sangat acak)
  level: SensorLevel;
  label: 'Normal' | 'Peningkatan Aktivitas' | 'Indikasi Disregulasi';
  score: number;
}

// ======================== FUSION RESULT ========================

/**
 * Keadaan fisiologis gabungan hasil fusion 3 sensor.
 * Menggunakan terminologi sesuai proposal skripsi.
 */
export type PhysiologicalState =
  | 'Normal'
  | 'Peningkatan Aktivitas'
  | 'Indikasi Disregulasi'
  | 'Biofeedback Aktif';

/**
 * Hasil akhir keputusan Biofeedback Decision Engine
 */
export interface FusionDecision {
  state: PhysiologicalState;
  confidence: number;           // 0–1, kepercayaan model terhadap keputusan
  weighted_score: number;       // Skor gabungan 0–100
  gsr_weight: number;           // Kontribusi GSR dalam keputusan (%)
  bpm_weight: number;           // Kontribusi BPM dalam keputusan (%)
  imu_weight: number;           // Kontribusi IMU dalam keputusan (%)
  triggered_sensors: string[];  // Sensor mana saja yang melampaui threshold
  shouldTriggerHaptic: boolean;
  hapticDurationMs: number;
  reasoning: string;            // Penjelasan naratif keputusan
}

// ======================== SNAPSHOT SISTEM ========================

/**
 * Snapshot lengkap analisis sistem pada satu titik waktu
 */
export interface SystemAnalysisSnapshot {
  timestamp: number;
  patient_id: string;
  device_id: string;
  gsr: GSRAnalysis;
  bpm: BPMAnalysis;
  imu: IMUAnalysis;
  decision: FusionDecision;
  baseline: AdaptiveBaseline;
  packet_seq: number;
}

// ======================== ADAPTIVE BASELINE ========================

/**
 * Baseline fisiologis adaptif per anak.
 * Diperbarui secara rolling selama sesi "tenang" (state = Normal).
 */
export interface AdaptiveBaseline {
  patient_id: string;
  gsr_mean: number;      // Rata-rata GSR baseline (µS)
  gsr_std: number;       // Standar deviasi GSR
  bpm_mean: number;      // Rata-rata BPM baseline
  bpm_std: number;       // Standar deviasi BPM
  sample_count: number;  // Jumlah sampel yang digunakan untuk baseline
  last_updated: number;  // Timestamp terakhir update
  is_valid: boolean;     // Apakah baseline sudah cukup stabil (sample_count >= MIN_BASELINE_SAMPLES)
}

// ======================== HISTORY ========================

/**
 * Satu entri dalam log keputusan engine
 */
export interface DecisionLogEntry {
  timestamp: number;
  patient_id: string;
  previous_state: PhysiologicalState;
  new_state: PhysiologicalState;
  gsr_us: number;
  bpm: number;
  fidget: number;
  weighted_score: number;
  haptic_triggered: boolean;
  reasoning: string;
}

// ======================== ENGINE CONFIG ========================

/**
 * Konfigurasi parameter engine (loaded dari ThresholdConfig database)
 */
export interface EngineConfig {
  // GSR thresholds
  gsr_warning_us: number;    // µS — mulai peningkatan
  gsr_critical_us: number;   // µS — disregulasi

  // BPM thresholds
  bpm_min: number;
  bpm_max: number;

  // IMU thresholds
  imu_fidget_warning: number;   // Fidget score — mulai peningkatan
  imu_fidget_critical: number;  // Fidget score — disregulasi

  // Sensor weights (total harus 1.0)
  weight_gsr: number;
  weight_bpm: number;
  weight_imu: number;

  // Decision thresholds (weighted_score)
  score_threshold_peningkatan: number;  // Skor minimal untuk "Peningkatan Aktivitas"
  score_threshold_disregulasi: number;  // Skor minimal untuk "Indikasi Disregulasi"
  score_threshold_biofeedback: number;  // Skor minimal untuk "Biofeedback Aktif"

  // Fusion requirement (berapa sensor harus aktif untuk trigger)
  fusion_sensors_required: number;  // Minimal N sensor di level WARNING

  // Haptic
  haptic_duration_ms: number;
  haptic_cooldown_ms: number;

  // Signal processing
  ema_alpha_gsr: number;   // EMA alpha untuk GSR (0.1–0.5)
  ema_alpha_bpm: number;   // EMA alpha untuk BPM
}
