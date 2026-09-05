import { TelemetryPayload, AlertEvent, ThresholdConfig } from '../types/index.js';
import { db } from '../db/database.js';

export class ESP32TelemetryManager {
  private isConnected = false;
  private lastTelemetry: TelemetryPayload | null = null;
  private activePatientId = '';
  private activeSessionId: string | null = null;
  private hapticActive = false;
  private hapticTimer: NodeJS.Timeout | null = null;
  private lastAlertTime = 0;

  private onTickListeners: Array<(payload: TelemetryPayload) => void> = [];
  private onAlertListeners: Array<(alert: AlertEvent) => void> = [];

  constructor() {
    // Starts in clean standby mode waiting for real hardware sensor packets
    console.log('[Hardware Manager] Menunggu modul ESP32-C3 & sensor fisik terhubung...');
  }

  public setActivePatient(patientId: string) {
    this.activePatientId = patientId;
  }

  public setActiveSession(sessionId: string | null) {
    this.activeSessionId = sessionId;
  }

  public onTick(cb: (payload: TelemetryPayload) => void) {
    this.onTickListeners.push(cb);
  }

  public onAlert(cb: (alert: AlertEvent) => void) {
    this.onAlertListeners.push(cb);
  }

  public processHardwareTelemetry(rawPayload: any): TelemetryPayload {
    this.isConnected = true;
    const now = Date.now();

    // Map incoming hardware JSON from ESP32
    const gsr_us = typeof rawPayload.gsr?.microsiemens === 'number' ? rawPayload.gsr.microsiemens : (rawPayload.gsr || 0.0);
    const bpm = typeof rawPayload.ppg?.bpm === 'number' ? rawPayload.ppg.bpm : (rawPayload.bpm || 0.0);
    const spo2 = typeof rawPayload.ppg?.spo2 === 'number' ? rawPayload.ppg.spo2 : (rawPayload.spo2 || 98.0);
    const fidget = typeof rawPayload.imu?.fidget_score === 'number' ? rawPayload.imu.fidget_score : (rawPayload.fidget || 0);

    const ax = rawPayload.imu?.ax ?? 0;
    const ay = rawPayload.imu?.ay ?? 0;
    const az = rawPayload.imu?.az ?? 1;

    // Deteksi apakah sensor GSR menempel pada kulit (Lead-off / Open Circuit detection)
    const isGsrAttached = gsr_us > 0.05 && rawPayload.gsr?.is_attached !== false;

    // Check thresholds for auto biofeedback alert logging with Anti-Spam
    const threshold = db.getThreshold(this.activePatientId);
    const baseCooldownMs = Math.max((threshold.haptic_cooldown_sec || 8) * 1000, 8000); // Konsisten 8-10s

    let isDisregulated = false;
    let alertReason = '';

    if (isGsrAttached && gsr_us >= threshold.gsr_critical_us) {
      isDisregulated = true;
      alertReason = `GSR ${gsr_us.toFixed(2)} μS melampaui ambang batas (${threshold.gsr_critical_us} μS)`;
    } else if (bpm >= threshold.bpm_max && bpm > 30 && fidget >= threshold.imu_fidget_threshold) {
      isDisregulated = true;
      alertReason = `Hiperaktivitas Terdeteksi: BPM ${Math.round(bpm)} + Fidgeting ${fidget}%`;
    }

    // Anti-Spam: Pastikan jeda responsif 8-10 detik antar getaran otomatis
    if (isDisregulated && threshold.auto_intervention_enabled && (now - this.lastAlertTime > baseCooldownMs)) {
      this.lastAlertTime = now;
      this.triggerHaptic(Math.min(1500, threshold.haptic_duration_ms || 1200), alertReason);
    }

    let gsrStatus: 'CALM' | 'NORMAL' | 'ELEVATED' | 'DISREGULATED' | 'UNATTACHED' = 'NORMAL';
    if (!isGsrAttached) gsrStatus = 'UNATTACHED';
    else if (gsr_us < 3.0) gsrStatus = 'CALM';
    else if (gsr_us < 6.0) gsrStatus = 'NORMAL';
    else if (gsr_us < threshold.gsr_critical_us) gsrStatus = 'ELEVATED';
    else gsrStatus = 'DISREGULATED';

    let motionState: 'STILL' | 'LIGHT_MOVEMENT' | 'MODERATE_FIDGETING' | 'HYPERACTIVE' = 'LIGHT_MOVEMENT';
    if (fidget < 20) motionState = 'STILL';
    else if (fidget < 50) motionState = 'LIGHT_MOVEMENT';
    else if (fidget < 75) motionState = 'MODERATE_FIDGETING';
    else motionState = 'HYPERACTIVE';

    const payload: TelemetryPayload = {
      device_id: rawPayload.device_id || 'esp32-c3-band-001',
      timestamp: now,
      seq: rawPayload.seq || (this.lastTelemetry ? this.lastTelemetry.seq + 1 : 1),
      gsr: {
        raw: rawPayload.gsr?.raw || 0,
        voltage: rawPayload.gsr?.voltage || 0,
        microsiemens: +gsr_us.toFixed(2),
        status: gsrStatus,
        is_attached: isGsrAttached
      },
      ppg: {
        bpm: +bpm.toFixed(1),
        spo2: +spo2.toFixed(1),
        hrv_rmssd: rawPayload.ppg?.hrv_rmssd || 45.0,
        finger_detected: rawPayload.ppg?.finger_detected !== false
      },
      imu: {
        ax: +ax.toFixed(2),
        ay: +ay.toFixed(2),
        az: +az.toFixed(2),
        gx: rawPayload.imu?.gx || 0,
        gy: rawPayload.imu?.gy || 0,
        gz: rawPayload.imu?.gz || 0,
        fidget_score: Math.round(fidget),
        motion_state: motionState
      },
      battery: {
        voltage: rawPayload.battery?.voltage || 3.95,
        percentage: rawPayload.battery?.percentage || 90,
        is_charging: !!rawPayload.battery?.is_charging
      },
      system: {
        haptic_active: this.hapticActive || !!rawPayload.system?.haptic_active,
        haptic_pattern: this.hapticActive ? 'PULSE_ALERT' : 'NONE',
        disregulation_flag: isDisregulated,
        state: this.hapticActive ? 'INTERVENTION_ACTIVE' : this.activeSessionId ? 'MONITORING' : 'IDLE',
        session_id: this.activeSessionId,
        active_patient_id: this.activePatientId
      }
    };

    this.lastTelemetry = payload;
    db.logTelemetry(payload);
    this.onTickListeners.forEach(cb => cb(payload));

    return payload;
  }

  public triggerHaptic(durationMs = 1500, reason = 'MANUAL_TRIGGER') {
    this.hapticActive = true;
    if (this.hapticTimer) clearTimeout(this.hapticTimer);

    const alert: AlertEvent = {
      id: `alert-${Date.now()}`,
      session_id: this.activeSessionId,
      patient_id: this.activePatientId,
      timestamp: Date.now(),
      type: reason as any,
      severity: reason === 'MANUAL_TRIGGER' ? 'LOW' : 'HIGH',
      trigger_reason: reason === 'MANUAL_TRIGGER' ? 'Uji Coba Getaran Haptik Manual via Web' : reason,
      haptic_delivered: true,
      duration_ms: durationMs,
      metrics_snapshot: {
        gsr_us: this.lastTelemetry?.gsr?.microsiemens || 0,
        bpm: this.lastTelemetry?.ppg?.bpm || 0,
        fidget_score: this.lastTelemetry?.imu?.fidget_score || 0
      }
    };

    db.addAlert(alert);
    this.onAlertListeners.forEach(cb => cb(alert));

    this.hapticTimer = setTimeout(() => {
      this.hapticActive = false;
    }, durationMs);
  }

  public getLatestTelemetry(): TelemetryPayload {
    if (this.lastTelemetry) return this.lastTelemetry;

    // Default standby object when no real hardware packets have arrived yet
    return {
      device_id: 'esp32-c3-band-001',
      timestamp: Date.now(),
      seq: 0,
      gsr: {
        raw: 0,
        voltage: 0,
        microsiemens: 0.0,
        status: 'NORMAL'
      },
      ppg: {
        bpm: 0.0,
        spo2: 0.0,
        hrv_rmssd: 0.0,
        finger_detected: false
      },
      imu: {
        ax: 0,
        ay: 0,
        az: 1,
        gx: 0,
        gy: 0,
        gz: 0,
        fidget_score: 0,
        motion_state: 'STILL'
      },
      battery: {
        voltage: 0.0,
        percentage: 0,
        is_charging: false
      },
      system: {
        haptic_active: false,
        haptic_pattern: 'NONE',
        disregulation_flag: false,
        state: 'IDLE',
        session_id: null,
        active_patient_id: ''
      }
    };
  }
}

export const telemetryManager = new ESP32TelemetryManager();
export const simulator = telemetryManager; // alias for compatibility
