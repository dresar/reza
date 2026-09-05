/**
 * ============================================================================
 * ADHD Wearable IoT — BiofeedbackDecisionEngine
 * Peneliti: Muhammad Reza (2209020111) — TI Fasilkom-TI UMSU 2026
 * ============================================================================
 *
 * ARSITEKTUR ENGINE:
 * ─────────────────
 * [MQTT Telemetry Tick 800ms]
 *        │
 *        ▼
 * ┌─────────────────────────────┐
 * │  SensorSignalProcessor      │  ← EMA filtering, slope, window stats
 * └─────────────────────────────┘
 *        │
 *        ▼
 * ┌─────────────────────────────┐
 * │  AdaptiveBaselineManager    │  ← Running mean/std baseline per anak
 * └─────────────────────────────┘
 *        │
 *        ▼
 * ┌─────────────────────────────┐
 * │  PhysiologicalStateClassifier│ ← Klasifikasi per sensor → score 0-100
 * └─────────────────────────────┘
 *        │
 *        ▼
 * ┌─────────────────────────────┐
 * │  WeightedFusionMatrix       │  ← Gabung 3 sensor → satu keputusan
 * └─────────────────────────────┘
 *        │
 *        ▼
 * ┌─────────────────────────────────────────────────────────┐
 * │  OUTPUT: State + HapticCommand + WebSocket Broadcast    │
 * └─────────────────────────────────────────────────────────┘
 *
 * STATE MACHINE (sesuai proposal skripsi, terminologi non-medis):
 * ───────────────────────────────────────────────────────────────
 *   Normal  →  Peningkatan Aktivitas  →  Indikasi Disregulasi  →  Biofeedback Aktif
 *      ↑_______________________________|__________________|__________|
 *                   (kembali ke normal jika score turun)
 *
 * ALGORITMA UTAMA:
 * ────────────────
 * 1. Exponential Moving Average (EMA): memperhalus noise sensor
 *    y[t] = α·x[t] + (1−α)·y[t−1]
 *
 * 2. Slope (laju perubahan GSR):
 *    Regresi linear OLS pada window N sampel terakhir
 *
 * 3. Z-score dari baseline adaptif:
 *    z = (x − μ_baseline) / σ_baseline
 *
 * 4. Weighted Fusion Score:
 *    S_total = w_gsr·S_gsr + w_bpm·S_bpm + w_imu·S_imu
 *    Default: w_gsr=0.45, w_bpm=0.30, w_imu=0.25
 *
 * 5. Decision thresholds pada S_total:
 *    <25:  Normal
 *    25–50: Peningkatan Aktivitas
 *    50–75: Indikasi Disregulasi
 *    ≥75:  Biofeedback Aktif → TRIGGER_HAPTIC
 */

import {
  GSRAnalysis,
  BPMAnalysis,
  IMUAnalysis,
  FusionDecision,
  SystemAnalysisSnapshot,
  AdaptiveBaseline,
  DecisionLogEntry,
  EngineConfig,
  PhysiologicalState,
  SensorLevel,
} from './types.js';
import { TelemetryPayload, ThresholdConfig } from '../types/index.js';
import { db } from '../db/database.js';

// ============================================================
//  CONSTANTS
// ============================================================

const MIN_BASELINE_SAMPLES = 20;   // Sampel minimum sebelum baseline dianggap valid
const MAX_WINDOW_SIZE = 30;        // Ukuran sliding window
const MAX_DECISION_LOG = 50;       // Maks entri log keputusan per anak
const BASELINE_UPDATE_INTERVAL = 5; // Update baseline setiap N sampel

/** Default engine config — akan di-override dari database ThresholdConfig */
const DEFAULT_CONFIG: EngineConfig = {
  gsr_warning_us: 8.5,
  gsr_critical_us: 10.0,
  bpm_min: 50.0,
  bpm_max: 115.0,
  imu_fidget_warning: 50,
  imu_fidget_critical: 75,
  weight_gsr: 0.45,
  weight_bpm: 0.30,
  weight_imu: 0.25,
  score_threshold_peningkatan: 30,
  score_threshold_disregulasi: 65,
  score_threshold_biofeedback: 75,
  fusion_sensors_required: 2,
  haptic_duration_ms: 1500,
  haptic_cooldown_ms: 8000,
  ema_alpha_gsr: 0.20,
  ema_alpha_bpm: 0.15,
};

// ============================================================
//  SensorSignalProcessor — Pure math utilities
// ============================================================

class SensorSignalProcessor {
  /**
   * Exponential Moving Average (EMA)
   * α tinggi → responsif terhadap perubahan tapi lebih noisy
   * α rendah → smooth tapi lambat mendeteksi perubahan cepat
   */
  static ema(alpha: number, newValue: number, prevEMA: number): number {
    if (prevEMA === 0) return newValue;
    return alpha * newValue + (1 - alpha) * prevEMA;
  }

  /**
   * Simple linear regression slope pada array nilai.
   * Menghitung laju perubahan (µS/detik atau BPM/detik).
   * Menggunakan metode OLS (Ordinary Least Squares).
   */
  static slope(values: number[]): number {
    const n = values.length;
    if (n < 2) return 0;

    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
    for (let i = 0; i < n; i++) {
      sumX += i;
      sumY += values[i];
      sumXY += i * values[i];
      sumX2 += i * i;
    }

    const denom = n * sumX2 - sumX * sumX;
    if (Math.abs(denom) < 1e-10) return 0;
    return (n * sumXY - sumX * sumY) / denom;
  }

  /**
   * Mean (rata-rata) array nilai
   */
  static mean(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((a, b) => a + b, 0) / values.length;
  }

  /**
   * Standard deviation populasi
   */
  static std(values: number[]): number {
    if (values.length < 2) return 1;
    const m = SensorSignalProcessor.mean(values);
    const variance = values.reduce((acc, v) => acc + (v - m) ** 2, 0) / values.length;
    return Math.sqrt(variance) || 1;
  }

  /**
   * Normalize nilai ke range 0–100 berdasarkan min dan max teoritis
   */
  static normalize(value: number, min: number, max: number): number {
    if (max === min) return 0;
    return Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100));
  }

  /**
   * Z-score: berapa standar deviasi nilai berada dari mean baseline
   */
  static zScore(value: number, mean: number, std: number): number {
    if (std === 0) return 0;
    return (value - mean) / std;
  }

  /**
   * Movement entropy: mengukur keacakan sinyal IMU menggunakan Shannon Entropy.
   * Nilai tinggi = gerakan tidak teratur (indikasi fidgeting acak).
   * Formula: H = -Σ p(x) * log2(p(x))
   */
  static movementEntropy(magnitudes: number[]): number {
    if (magnitudes.length < 4) return 0;

    // Buat histogram 8 bin
    const min = Math.min(...magnitudes);
    const max = Math.max(...magnitudes);
    if (max === min) return 0;

    const bins = 8;
    const binSize = (max - min) / bins;
    const hist = new Array(bins).fill(0);

    for (const v of magnitudes) {
      const bin = Math.min(bins - 1, Math.floor((v - min) / binSize));
      hist[bin]++;
    }

    const n = magnitudes.length;
    let entropy = 0;
    for (const count of hist) {
      if (count > 0) {
        const p = count / n;
        entropy -= p * Math.log2(p);
      }
    }

    // Normalize ke 0–1 (max entropy = log2(bins))
    return entropy / Math.log2(bins);
  }
}

// ============================================================
//  AdaptiveBaselineManager — Running baseline per patient
// ============================================================

class AdaptiveBaselineManager {
  private baselines = new Map<string, AdaptiveBaseline>();
  private gsrHistory = new Map<string, number[]>();
  private bpmHistory = new Map<string, number[]>();

  getBaseline(patientId: string): AdaptiveBaseline {
    if (!this.baselines.has(patientId)) {
      this.baselines.set(patientId, this.createDefault(patientId));
    }
    return this.baselines.get(patientId)!;
  }

  private createDefault(patientId: string): AdaptiveBaseline {
    // Coba load baseline dari profil pasien di database
    const patient = db.getPatients().find(p => p.id === patientId);
    return {
      patient_id: patientId,
      gsr_mean: patient?.baseline_gsr || 3.5,
      gsr_std: 1.0,
      bpm_mean: patient?.baseline_bpm || 80,
      bpm_std: 8.0,
      sample_count: 0,
      last_updated: Date.now(),
      is_valid: false,
    };
  }

  /**
   * Update baseline dengan sampel baru.
   * Hanya update saat state sedang "Normal" untuk menghindari kontaminasi.
   */
  updateBaseline(patientId: string, gsrUs: number, bpm: number, forceUpdate = false): void {
    const gHist = this.gsrHistory.get(patientId) || [];
    const bHist = this.bpmHistory.get(patientId) || [];

    // Hanya tambah sampel valid
    if (gsrUs > 0.1 && gsrUs < 40) gHist.push(gsrUs);
    if (bpm > 40 && bpm < 200) bHist.push(bpm);

    // Keep window
    if (gHist.length > 120) gHist.shift();
    if (bHist.length > 120) bHist.shift();

    this.gsrHistory.set(patientId, gHist);
    this.bpmHistory.set(patientId, bHist);

    const baseline = this.getBaseline(patientId);
    baseline.sample_count++;

    // Update setiap BASELINE_UPDATE_INTERVAL sampel
    if (baseline.sample_count % BASELINE_UPDATE_INTERVAL === 0 || forceUpdate) {
      if (gHist.length >= 5) {
        baseline.gsr_mean = SensorSignalProcessor.mean(gHist);
        baseline.gsr_std = Math.max(0.3, SensorSignalProcessor.std(gHist));
      }
      if (bHist.length >= 5) {
        baseline.bpm_mean = SensorSignalProcessor.mean(bHist);
        baseline.bpm_std = Math.max(3.0, SensorSignalProcessor.std(bHist));
      }
      baseline.is_valid = gHist.length >= MIN_BASELINE_SAMPLES;
      baseline.last_updated = Date.now();
    }
  }

  resetBaseline(patientId: string): void {
    this.gsrHistory.delete(patientId);
    this.bpmHistory.delete(patientId);
    this.baselines.delete(patientId);
  }
}

// ============================================================
//  PhysiologicalStateClassifier — Per-sensor analysis
// ============================================================

class PhysiologicalStateClassifier {
  /**
   * Analisis GSR (Galvanic Skin Response)
   * Menggunakan: nilai EMA, slope, z-score dari baseline, persentase perubahan
   */
  classifyGSR(
    gsrUs: number,
    emaGsr: number,
    gsrWindow: number[],
    baseline: AdaptiveBaseline,
    config: EngineConfig
  ): GSRAnalysis {
    const slope = SensorSignalProcessor.slope(gsrWindow.slice(-10)) * 1000; // µS/detik
    const changePct = baseline.gsr_mean > 0
      ? ((emaGsr - baseline.gsr_mean) / baseline.gsr_mean) * 100
      : 0;
    const zScore = SensorSignalProcessor.zScore(emaGsr, baseline.gsr_mean, baseline.gsr_std);
    const isAttached = gsrUs > 0.05;

    let level: SensorLevel = 0;
    let score = 0;
    let label: GSRAnalysis['label'] = 'Normal';

    if (!isAttached) {
      level = 0;
      score = 0;
      label = 'Belum Terpasang';
    } else if (emaGsr >= 10.0 || zScore >= 2.5) {
      // Sentuh basah / keringat tinggi / stres -> Disregulasi Kritis (>= 10 uS)
      level = 2;
      score = 75 + Math.min(25, (emaGsr - 10.0) * 6);
      label = 'Indikasi Disregulasi';
    } else if (emaGsr >= 8.0 || slope > 0.5) {
      // Peningkatan Aktivitas (8.0 - 9.9 uS)
      level = 1;
      score = 35 + SensorSignalProcessor.normalize(emaGsr, 8.0, 10.0) * 0.4;
      label = 'Peningkatan Aktivitas';
    } else {
      // Normal di Tangan (4.5 - 8.0 uS)
      level = 0;
      score = 15;
      label = 'Normal';
    }

    score = Math.min(100, Math.max(0, score));

    return {
      raw_us: gsrUs,
      ema_us: isAttached ? emaGsr : 0,
      slope_us_per_s: isAttached ? slope : 0,
      change_pct: isAttached ? changePct : 0,
      level,
      label,
      score,
      is_attached: isAttached
    };
  }

  /**
   * Analisis BPM / Denyut Nadi
   */
  classifyBPM(
    bpm: number,
    emaBpm: number,
    bpmWindow: number[],
    baseline: AdaptiveBaseline,
    config: EngineConfig
  ): BPMAnalysis {
    const deviation = emaBpm - baseline.bpm_mean;
    const zScore = SensorSignalProcessor.zScore(emaBpm, baseline.bpm_mean, baseline.bpm_std);
    const hrv = bpmWindow.length >= 4
      ? SensorSignalProcessor.std(bpmWindow.slice(-8)) * 10 // Approx RMSSD proxy
      : 30;

    let level: SensorLevel = 0;
    let score = 0;

    const tooHigh = emaBpm > config.bpm_max; // > 115 BPM
    const isElevated = emaBpm > (config.bpm_max - 15); // > 100 BPM
    const stressedHRV = hrv < 15;

    if (tooHigh && (zScore >= 1.5 || stressedHRV)) {
      level = 2;
      score = 70 + Math.min(30, Math.abs(deviation) * 1.5);
    } else if (tooHigh || isElevated) {
      level = 1;
      score = 35 + Math.min(35, Math.abs(deviation) * 1.2);
    } else {
      level = 0;
      score = 10;
    }

    // BPM 0 = tidak ada jari / sensor tidak terbaca — jangan hitung
    if (bpm === 0 || bpm < 30) {
      level = 0;
      score = 0;
    }

    score = Math.min(100, Math.max(0, score));

    const labels: Record<SensorLevel, BPMAnalysis['label']> = {
      0: 'Normal',
      1: 'Peningkatan Aktivitas',
      2: 'Indikasi Disregulasi',
    };

    return {
      bpm,
      ema_bpm: emaBpm,
      hrv_rmssd: hrv,
      deviation_from_baseline: deviation,
      level,
      label: labels[level],
      score,
    };
  }

  /**
   * Analisis IMU / Gerakan Tubuh (MPU6050)
   */
  classifyIMU(
    fidgetScore: number,
    accelMagnitude: number,
    imuWindow: number[],
    config: EngineConfig
  ): IMUAnalysis {
    const gyroEnergy = 0; // disediakan dari telemetry jika ada
    const entropy = SensorSignalProcessor.movementEntropy(imuWindow.slice(-16));

    let level: SensorLevel = 0;
    let score = 0;

    if (fidgetScore >= config.imu_fidget_critical || (fidgetScore >= config.imu_fidget_warning && entropy > 0.7)) {
      level = 2;
      score = 70 + Math.min(30, (fidgetScore - config.imu_fidget_critical) * 1.5);
    } else if (fidgetScore >= config.imu_fidget_warning || accelMagnitude > 1.4) {
      level = 1;
      score = 30 + SensorSignalProcessor.normalize(fidgetScore, config.imu_fidget_warning, config.imu_fidget_critical) * 0.4;
    } else {
      level = 0;
      score = SensorSignalProcessor.normalize(fidgetScore, 0, config.imu_fidget_warning) * 0.25;
    }

    score = Math.min(100, Math.max(0, score));

    const labels: Record<SensorLevel, IMUAnalysis['label']> = {
      0: 'Normal',
      1: 'Peningkatan Aktivitas',
      2: 'Indikasi Disregulasi',
    };

    return {
      fidget_score: fidgetScore,
      accel_magnitude: accelMagnitude,
      gyro_energy: gyroEnergy,
      movement_entropy: entropy,
      level,
      label: labels[level],
      score,
    };
  }

  /**
   * Weighted Fusion Decision Matrix
   * Menggabungkan hasil 3 sensor menjadi satu keputusan final.
   *
   * Formula:
   *   S_total = w_gsr·S_gsr + w_bpm·S_bpm + w_imu·S_imu
   *   confidence = f(agreement between sensors)
   */
  fusionDecision(
    gsr: GSRAnalysis,
    bpm: BPMAnalysis,
    imu: IMUAnalysis,
    config: EngineConfig,
    lastHapticTime: number,
    consecutiveCount: number = 0,
    disregulationStreak: number = 0,
    restUntil: number = 0
  ): FusionDecision {
    const isGsrValid = gsr.is_attached !== false && gsr.raw_us > 0.05;
    const isBpmValid = bpm.bpm > 30;

    const gsrEffectiveScore = isGsrValid ? gsr.score : 0;
    const gsrEffectiveLevel = isGsrValid ? gsr.level : (0 as SensorLevel);
    const bpmEffectiveScore = isBpmValid ? bpm.score : 0;
    const bpmEffectiveLevel = isBpmValid ? bpm.level : (0 as SensorLevel);

    const weightedScore =
      config.weight_gsr * gsrEffectiveScore +
      config.weight_bpm * bpmEffectiveScore +
      config.weight_imu * imu.score;

    // Hitung agreement (confidence)
    const levels = [gsrEffectiveLevel, bpmEffectiveLevel, imu.level];
    const maxLevel = Math.max(...levels) as SensorLevel;
    const agreement = levels.filter(l => l >= maxLevel).length / 3;
    const confidence = Math.min(1, (weightedScore / 100) * (0.6 + 0.4 * agreement));

    // Tentukan triggered sensors
    const triggered: string[] = [];
    if (isGsrValid && gsr.level >= 1) triggered.push(`GSR (${gsr.ema_us.toFixed(2)}µS, ${gsr.label})`);
    if (isBpmValid && bpm.level >= 1) triggered.push(`BPM (${bpm.ema_bpm.toFixed(1)} BPM, ${bpm.label})`);
    if (imu.level >= 1) triggered.push(`IMU (Fidget ${imu.fidget_score}%, ${imu.label})`);

    const activeSensors = levels.filter(l => l >= 1).length;
    const allThreeActive = (isGsrValid && gsr.level >= 1) && (isBpmValid && bpm.level >= 1) && (imu.level >= 1);
    const fusionMet = activeSensors >= config.fusion_sensors_required;

    // 1. Tentukan Candidate State
    let state: PhysiologicalState = 'Normal';
    if (allThreeActive || (weightedScore >= config.score_threshold_biofeedback && fusionMet) || (activeSensors >= 2 && maxLevel === 2)) {
      state = 'Biofeedback Aktif';
    } else if ((weightedScore >= config.score_threshold_disregulasi && fusionMet) || activeSensors >= 2) {
      state = 'Indikasi Disregulasi';
    } else if (weightedScore >= config.score_threshold_peningkatan || activeSensors >= 1) {
      state = 'Peningkatan Aktivitas';
    }

    // ── 🧠 SISTEM CERDAS ANTI-SPAM BIOFEEDBACK ──
    const now = Date.now();
    let shouldTriggerHaptic = false;
    let antiSpamReason = '';

    // A. Cek Proteksi Istirahat Sensorik (Sensory Rest Timeout)
    const isUnderSensoryRest = now < restUntil;

    // B. Hitung Jeda Cooldown Terukur (Konsisten ~8 - 10 detik)
    const baseCooldownMs = Math.max(config.haptic_cooldown_ms, 8000); // 8 - 10 detik
    const effectiveCooldownMs = baseCooldownMs;
    const cooldownElapsed = now - lastHapticTime > effectiveCooldownMs;

    // C. Cek Inhibisi Recovery Trend (Jika GSR sedang menurun / anak sedang menenangkan diri)
    const isSelfRegulating = isGsrValid && gsr.slope_us_per_s < -0.06;

    // D. Evaluasi Keputusan Getar Cerdas
    if (state === 'Biofeedback Aktif') {
      if (isUnderSensoryRest) {
        shouldTriggerHaptic = false;
        const sLeft = Math.ceil((restUntil - now) / 1000);
        antiSpamReason = `[Anti-Spam] Sensory Rest (${sLeft}s)`;
      } else if (isSelfRegulating) {
        // Anak sedang mereda secara alami, jangan diganggu dengan getaran
        shouldTriggerHaptic = false;
        antiSpamReason = `[Smart Loop] Ananda sedang berproses rileks (GSR slope menurun) — getaran diinhibisi`;
      } else if (cooldownElapsed) {
        shouldTriggerHaptic = true;
      } else {
        const cdLeft = Math.ceil((effectiveCooldownMs - (now - lastHapticTime)) / 1000);
        antiSpamReason = `[Anti-Spam] Jeda adaptasi aktif (${cdLeft}s tersisa)`;
      }
    }

    // Durasi getaran yang lembut dan terukur (gentle cue 1000ms - 1500ms)
    const hapticDurationMs = allThreeActive ? Math.min(1500, config.haptic_duration_ms) : Math.min(1200, config.haptic_duration_ms);

    // Buat narasi klinis
    const reasoning = this.buildReasoning(state, gsr, bpm, imu, weightedScore, fusionMet, activeSensors, config, allThreeActive, antiSpamReason);

    return {
      state,
      confidence,
      weighted_score: weightedScore,
      gsr_weight: config.weight_gsr * 100,
      bpm_weight: config.weight_bpm * 100,
      imu_weight: config.weight_imu * 100,
      triggered_sensors: triggered,
      shouldTriggerHaptic,
      hapticDurationMs,
      reasoning,
    };
  }

  private buildReasoning(
    state: PhysiologicalState,
    gsr: GSRAnalysis, bpm: BPMAnalysis, imu: IMUAnalysis,
    score: number, fusionMet: boolean, activeSensors: number,
    config: EngineConfig, allThreeActive: boolean,
    antiSpamNote: string = ''
  ): string {
    const parts: string[] = [];

    parts.push(`Skor Fusion: ${score.toFixed(1)}/100`);
    if (gsr.is_attached !== false && gsr.raw_us > 0.05 && gsr.raw_us < 18.0) {
      parts.push(`GSR: ${gsr.ema_us.toFixed(2)}µS (${gsr.label})`);
    } else {
      parts.push(`GSR: Belum Menempel`);
    }

    if (bpm.bpm > 30) {
      parts.push(`BPM: ${bpm.ema_bpm.toFixed(1)} (${bpm.label})`);
    } else {
      parts.push(`BPM: Jari Belum Menempel`);
    }

    parts.push(`IMU: ${imu.fidget_score}% (${imu.label})`);

    if (allThreeActive) {
      parts.push('⚡ SINERGI 3 SENSOR AKTIF');
    }

    if (antiSpamNote) {
      parts.push(antiSpamNote);
    } else if (state === 'Biofeedback Aktif') {
      parts.push('→ Biofeedback haptic diaktifkan');
    }

    return parts.join(' | ');
  }
}

// ============================================================
//  BiofeedbackDecisionEngine — Main orchestrator
// ============================================================

/**
 * Singleton engine yang memproses setiap telemetry tick dari ESP32.
 * Dipanggil dari MQTT broker callback setiap data masuk (~800ms).
 */
export class BiofeedbackDecisionEngine {
  private processor = new SensorSignalProcessor();
  private baselineManager = new AdaptiveBaselineManager();
  private classifier = new PhysiologicalStateClassifier();

  // Per-patient state
  private emaGsr = new Map<string, number>();
  private emaBpm = new Map<string, number>();
  private gsrWindow = new Map<string, number[]>();
  private bpmWindow = new Map<string, number[]>();
  private imuWindow = new Map<string, number[]>();
  private lastHapticTime = new Map<string, number>();
  private lastState = new Map<string, PhysiologicalState>();
  private decisionLog = new Map<string, DecisionLogEntry[]>();
  private latestSnapshot = new Map<string, SystemAnalysisSnapshot>();
  private sampleCount = new Map<string, number>();

  // Intelligent Anti-Spam state tracking
  private consecutiveHapticCount = new Map<string, number>();
  private disregulationStreak = new Map<string, number>();
  private normalStreak = new Map<string, number>();
  private sensoryRestUntil = new Map<string, number>();

  /**
   * Callback yang dipanggil saat engine memutuskan trigger haptic.
   * Diset dari index.ts untuk publish MQTT command.
   */
  onHapticRequired?: (patientId: string, durationMs: number, reason: string) => void;

  /**
   * Callback broadcast WebSocket untuk semua klien.
   */
  onDecision?: (snapshot: SystemAnalysisSnapshot) => void;

  /**
   * Entry point utama: dipanggil setiap MQTT telemetry tick masuk.
   */
  processTelemetry(telemetry: TelemetryPayload, patientId: string): SystemAnalysisSnapshot {
    const pid = patientId;
    const count = (this.sampleCount.get(pid) || 0) + 1;
    this.sampleCount.set(pid, count);

    // ── 1. Load konfigurasi threshold dari database ──
    const config = this.loadConfig(pid);

    // ── 2. EMA Filtering ──
    const rawGsr = telemetry.gsr?.microsiemens || 0;
    const rawBpm = telemetry.ppg?.bpm || 0;
    const fidget = telemetry.imu?.fidget_score || 0;
    const accelMag = Math.sqrt(
      (telemetry.imu?.ax || 0) ** 2 +
      (telemetry.imu?.ay || 0) ** 2 +
      (telemetry.imu?.az || 0) ** 2
    );

    const emaGsr = SensorSignalProcessor.ema(
      config.ema_alpha_gsr, rawGsr, this.emaGsr.get(pid) || rawGsr
    );
    const emaBpm = SensorSignalProcessor.ema(
      config.ema_alpha_bpm, rawBpm, this.emaBpm.get(pid) || rawBpm
    );
    this.emaGsr.set(pid, emaGsr);
    this.emaBpm.set(pid, emaBpm);

    // ── 3. Update sliding windows ──
    const gWin = this.pushWindow(this.gsrWindow, pid, emaGsr);
    const bWin = this.pushWindow(this.bpmWindow, pid, emaBpm);
    const iWin = this.pushWindow(this.imuWindow, pid, accelMag);

    // ── 4. Adaptive Baseline Update ──
    // Hanya update saat state sebelumnya "Normal" (tidak terkontaminasi)
    const prevState = this.lastState.get(pid) || 'Normal';
    if (prevState === 'Normal') {
      this.baselineManager.updateBaseline(pid, emaGsr, emaBpm);
    }
    const baseline = this.baselineManager.getBaseline(pid);

    // ── 5. Per-Sensor Classification ──
    const gsrAnalysis = this.classifier.classifyGSR(rawGsr, emaGsr, gWin, baseline, config);
    const bpmAnalysis = this.classifier.classifyBPM(rawBpm, emaBpm, bWin, baseline, config);
    const imuAnalysis = this.classifier.classifyIMU(fidget, accelMag, iWin, config);

    // Track streaks for Anti-Spam debounce
    const isAroused = (gsrAnalysis.level >= 1 && gsrAnalysis.is_attached !== false) || (bpmAnalysis.level >= 1 && bpmAnalysis.bpm > 30) || imuAnalysis.level >= 1;
    if (isAroused) {
      this.disregulationStreak.set(pid, (this.disregulationStreak.get(pid) || 0) + 1);
      this.normalStreak.set(pid, 0);
    } else {
      this.disregulationStreak.set(pid, 0);
      const norm = (this.normalStreak.get(pid) || 0) + 1;
      this.normalStreak.set(pid, norm);
      // Reset consecutive haptic count when child stays calm for >= 3 ticks (~2.4s)
      if (norm >= 3) {
        this.consecutiveHapticCount.set(pid, 0);
      }
    }

    // ── 6. Weighted Fusion Decision with Smart Anti-Spam Controller ──
    const lastHaptic = this.lastHapticTime.get(pid) || 0;
    const consec = this.consecutiveHapticCount.get(pid) || 0;
    const streak = this.disregulationStreak.get(pid) || 0;
    const restUntil = this.sensoryRestUntil.get(pid) || 0;

    const decision = this.classifier.fusionDecision(
      gsrAnalysis, bpmAnalysis, imuAnalysis, config, lastHaptic, consec, streak, restUntil
    );

    // ── 7. Log state transition ──
    if (decision.state !== prevState) {
      this.logDecision(pid, prevState, decision, gsrAnalysis, bpmAnalysis, imuAnalysis);
    }
    this.lastState.set(pid, decision.state);

    // ── 8. Trigger Haptic jika diperlukan (Anti-Spam Safe) ──
    if (decision.shouldTriggerHaptic) {
      const now = Date.now();
      this.lastHapticTime.set(pid, now);
      const newConsec = consec + 1;
      this.consecutiveHapticCount.set(pid, newConsec);

      // Jika getaran telah terjadi 4 kali berturut-turut, aktifkan jeda sensorik singkat 12 detik
      if (newConsec >= 4) {
        this.sensoryRestUntil.set(pid, now + 12000);
        this.consecutiveHapticCount.set(pid, 0);
      }

      // Simpan alert ke database
      const alert = {
        id: `alert-engine-${now}`,
        session_id: telemetry.system?.session_id || null,
        patient_id: pid,
        timestamp: now,
        type: 'MULTISENSOR_DISREGULATION' as const,
        severity: 'HIGH' as const,
        trigger_reason: decision.reasoning,
        haptic_delivered: true,
        duration_ms: decision.hapticDurationMs,
        metrics_snapshot: {
          gsr_us: rawGsr,
          bpm: rawBpm,
          fidget_score: fidget,
        },
      };
      db.addAlert(alert);

      // Trigger callback ke MQTT/WebSocket
      this.onHapticRequired?.(pid, decision.hapticDurationMs, decision.state);
    }

    // ── 9. Build snapshot & broadcast ──
    const snapshot: SystemAnalysisSnapshot = {
      timestamp: telemetry.timestamp || Date.now(),
      patient_id: pid,
      device_id: telemetry.device_id,
      gsr: gsrAnalysis,
      bpm: bpmAnalysis,
      imu: imuAnalysis,
      decision,
      baseline,
      packet_seq: telemetry.seq || count,
    };

    this.latestSnapshot.set(pid, snapshot);
    this.onDecision?.(snapshot);

    return snapshot;
  }

  // ── Helpers ──

  private pushWindow(map: Map<string, number[]>, pid: string, value: number): number[] {
    const win = map.get(pid) || [];
    win.push(value);
    if (win.length > MAX_WINDOW_SIZE) win.shift();
    map.set(pid, win);
    return win;
  }

  private loadConfig(patientId: string): EngineConfig {
    const thresh = db.getThreshold(patientId);
    if (!thresh) return { ...DEFAULT_CONFIG };

    return {
      ...DEFAULT_CONFIG,
      gsr_warning_us: thresh.gsr_warning_us || DEFAULT_CONFIG.gsr_warning_us,
      gsr_critical_us: thresh.gsr_critical_us || DEFAULT_CONFIG.gsr_critical_us,
      bpm_min: thresh.bpm_min || DEFAULT_CONFIG.bpm_min,
      bpm_max: thresh.bpm_max || DEFAULT_CONFIG.bpm_max,
      imu_fidget_warning: Math.round(thresh.imu_fidget_threshold * 0.7) || DEFAULT_CONFIG.imu_fidget_warning,
      imu_fidget_critical: thresh.imu_fidget_threshold || DEFAULT_CONFIG.imu_fidget_critical,
      haptic_duration_ms: thresh.haptic_duration_ms || DEFAULT_CONFIG.haptic_duration_ms,
      haptic_cooldown_ms: (thresh.haptic_cooldown_sec || 8) * 1000,
    };
  }

  private logDecision(
    pid: string,
    prevState: PhysiologicalState,
    decision: FusionDecision,
    gsr: GSRAnalysis, bpm: BPMAnalysis, imu: IMUAnalysis
  ): void {
    const log = this.decisionLog.get(pid) || [];
    log.push({
      timestamp: Date.now(),
      patient_id: pid,
      previous_state: prevState,
      new_state: decision.state,
      gsr_us: gsr.ema_us,
      bpm: bpm.ema_bpm,
      fidget: imu.fidget_score,
      weighted_score: decision.weighted_score,
      haptic_triggered: decision.shouldTriggerHaptic,
      reasoning: decision.reasoning,
    });
    if (log.length > MAX_DECISION_LOG) log.shift();
    this.decisionLog.set(pid, log);
  }

  // ── Public API ──

  getLatestSnapshot(patientId: string): SystemAnalysisSnapshot | null {
    return this.latestSnapshot.get(patientId) || null;
  }

  getDecisionLog(patientId: string): DecisionLogEntry[] {
    return this.decisionLog.get(patientId) || [];
  }

  getBaseline(patientId: string): AdaptiveBaseline {
    return this.baselineManager.getBaseline(patientId);
  }

  resetPatient(patientId: string): void {
    this.baselineManager.resetBaseline(patientId);
    this.emaGsr.delete(patientId);
    this.emaBpm.delete(patientId);
    this.gsrWindow.delete(patientId);
    this.bpmWindow.delete(patientId);
    this.imuWindow.delete(patientId);
    this.lastHapticTime.delete(patientId);
    this.lastState.delete(patientId);
    this.decisionLog.delete(patientId);
    this.latestSnapshot.delete(patientId);
    this.sampleCount.delete(patientId);
  }

  /**
   * Dokumentasi engine dalam format JSON untuk endpoint /api/engine/docs
   */
  getDocumentation() {
    return {
      engine: 'BiofeedbackDecisionEngine v1.0',
      author: 'Muhammad Reza (2209020111) — TI Fasilkom-TI UMSU 2026',
      description: 'Backend-driven multi-sensor physiological state classifier for ADHD wearable biofeedback system.',
      architecture: {
        pipeline: [
          '1. MQTT Telemetry Ingestion (800ms interval)',
          '2. EMA Signal Filtering (alpha_gsr=0.20, alpha_bpm=0.15)',
          '3. Adaptive Baseline Estimation (rolling window, N≥20)',
          '4. Per-Sensor Classification (GSR, PPG/BPM, IMU)',
          '5. Weighted Fusion Matrix Decision',
          '6. State Machine Transition',
          '7. Haptic Command Publishing (MQTT) + WebSocket Broadcast',
        ],
        sensor_weights: {
          gsr: '45% — GSR paling sensitif terhadap stres otonom',
          bpm: '30% — Denyut nadi sebagai validasi klinis',
          imu: '25% — Fidgeting sebagai indikator behavioral',
        },
      },
      states: {
        Normal: 'Skor fusion < 25. Tidak ada aksi.',
        'Peningkatan Aktivitas': 'Skor fusion 25–50. Dicatat, tidak ada haptic.',
        'Indikasi Disregulasi': 'Skor fusion 50–75, ≥2 sensor aktif. Alert dikirim ke dashboard.',
        'Biofeedback Aktif': 'Skor fusion ≥75, ≥2 sensor aktif. Haptic motor diaktifkan.',
      },
      algorithms: {
        EMA: 'y[t] = α·x[t] + (1−α)·y[t−1] — memperhalus noise sensor',
        slope: 'OLS linear regression — mendeteksi laju perubahan GSR (µS/detik)',
        z_score: 'z = (x − μ) / σ — normalisasi terhadap baseline adaptif',
        entropy: 'Shannon entropy pada 8 bin histogram — mengukur keacakan gerakan IMU',
        fusion: 'S = w_gsr·S_gsr + w_bpm·S_bpm + w_imu·S_imu — weighted average',
      },
      thresholds_source: 'Database /api/thresholds/:patientId — dapat diubah realtime dari dashboard',
      haptic_cooldown: '8 detik default (dapat dikonfigurasi per anak)',
      firmware_role: 'ESP32 hanya mengirim raw data — semua keputusan di backend (backend-driven)',
    };
  }
}

// Singleton instance
export const decisionEngine = new BiofeedbackDecisionEngine();
