export interface SensorDataGSR {
  raw: number;
  voltage: number;
  microsiemens: number;
  status: 'CALM' | 'NORMAL' | 'ELEVATED' | 'DISREGULATED' | 'UNATTACHED';
  is_attached?: boolean;
}

export interface SensorDataPPG {
  bpm: number;
  spo2: number;
  hrv_rmssd: number;
  finger_detected: boolean;
}

export interface SensorDataIMU {
  ax: number;
  ay: number;
  az: number;
  gx: number;
  gy: number;
  gz: number;
  fidget_score: number;
  motion_state: 'STILL' | 'LIGHT_MOVEMENT' | 'MODERATE_FIDGETING' | 'HYPERACTIVE';
}

export interface BatteryStatus {
  voltage: number;
  percentage: number;
  is_charging: boolean;
}

export interface SystemState {
  haptic_active: boolean;
  haptic_pattern: string;
  disregulation_flag: boolean;
  state: 'IDLE' | 'MONITORING' | 'INTERVENTION_ACTIVE' | 'CALIBRATING';
  session_id: string | null;
  active_patient_id: string;
}

export interface TelemetryPayload {
  device_id: string;
  timestamp: number;
  seq: number;
  gsr: SensorDataGSR;
  ppg: SensorDataPPG;
  imu: SensorDataIMU;
  battery: BatteryStatus;
  system: SystemState;
}

export interface AlertEvent {
  id: string;
  session_id: string | null;
  patient_id: string;
  timestamp: number;
  type: 'GSR_SPIKE' | 'TACHYCARDIA' | 'HYPERACTIVITY_ALERT' | 'MULTISENSOR_DISREGULATION' | 'MANUAL_TRIGGER';
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  trigger_reason: string;
  haptic_delivered: boolean;
  duration_ms: number;
  metrics_snapshot: {
    gsr_us: number;
    bpm: number;
    fidget_score: number;
  };
}

export type UserRole = 'TERAPIS' | 'ORANG_TUA';

export interface UserAccount {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  password?: string;
  phone?: string;
  avatar_color?: string;
  linked_patient_id?: string;
  title_or_relation?: string; // e.g. "Spesialis Tumbuh Kembang" atau "Ibu Kandung"
  created_at: string;
}

export interface PatientProfile {
  id: string;
  name: string;
  nickname: string;
  age: number;
  gender: string;
  adhd_subtype: 'Combined Type' | 'Predominantly Inattentive' | 'Predominantly Hyperactive-Impulsive';
  baseline_gsr: number;
  baseline_bpm: number;
  notes: string;
  avatar_color: string;
  parent_name?: string;
  parent_email?: string;
  parent_phone?: string;
  parent_user_id?: string;
  device_id?: string;
  created_at: string;
}

export interface ThresholdConfig {
  id: string;
  patient_id: string;
  gsr_warning_us: number;
  gsr_critical_us: number;
  bpm_min: number;
  bpm_max: number;
  imu_fidget_threshold: number;
  haptic_intensity_pct: number;
  haptic_duration_ms: number;
  haptic_cooldown_sec: number;
  auto_intervention_enabled: boolean;
}

export interface MonitoringSession {
  id: string;
  patient_id: string;
  title: string;
  start_time: string;
  end_time: string | null;
  duration_seconds: number;
  status: 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
  avg_gsr: number;
  peak_gsr: number;
  avg_bpm: number;
  peak_bpm: number;
  alert_count: number;
  notes: string;
}

export interface ClinicalNote {
  id: string;
  session_id: string | null;
  patient_id: string;
  author: string;
  timestamp: string;
  category: 'OBSERVATION' | 'INTERVENTION_RESPONSE' | 'THERAPY_PROGRESS' | 'PARENT_FEEDBACK';
  content: string;
}
