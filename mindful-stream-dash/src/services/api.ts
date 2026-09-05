const API_BASE = 'http://localhost:5001/api';

export type UserRole = 'TERAPIS' | 'ORANG_TUA';

export interface UserAccount {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  phone?: string;
  avatar_color?: string;
  linked_patient_id?: string;
  title_or_relation?: string;
  created_at?: string;
}

export interface AuthResponse {
  success: boolean;
  message?: string;
  user?: UserAccount;
  linkedPatient?: Patient | null;
}

export interface Patient {
  id: string;
  name: string;
  nickname: string;
  age: number;
  gender: string;
  adhd_subtype: string;
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

export interface AlertEvent {
  id: string;
  session_id: string | null;
  patient_id: string;
  timestamp: number;
  type: string;
  severity: string;
  trigger_reason: string;
  haptic_delivered: boolean;
  duration_ms: number;
  metrics_snapshot: {
    gsr_us: number;
    bpm: number;
    fidget_score: number;
  };
}

export interface ClinicalNote {
  id: string;
  session_id: string | null;
  patient_id: string;
  author: string;
  timestamp: string;
  category: string;
  content: string;
}

export interface SystemStatus {
  success: boolean;
  service: string;
  version: string;
  system_time: string;
  mqtt: {
    healthy: boolean;
    port: number;
    connected_clients: string[];
    hardware_esp32_connected: boolean;
  };
  websocket: {
    connected_dashboards: number;
    port: number;
  };
  simulator: {
    mode: string;
  };
}

export const api = {
  async getStatus(): Promise<SystemStatus> {
    const res = await fetch(`${API_BASE}/status`);
    return res.json();
  },

  async getLatestTelemetry() {
    const res = await fetch(`${API_BASE}/telemetry/latest`);
    return res.json();
  },

  async getTelemetryHistory(limit = 50) {
    const res = await fetch(`${API_BASE}/telemetry/history?limit=${limit}`);
    return res.json();
  },

  async getPatients(): Promise<Patient[]> {
    const res = await fetch(`${API_BASE}/patients`);
    const json = await res.json();
    return json.data || [];
  },

  async savePatient(patient: Partial<Patient>): Promise<Patient> {
    const res = await fetch(`${API_BASE}/patients`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patient),
    });
    const json = await res.json();
    return json.data;
  },

  async deletePatient(id: string): Promise<boolean> {
    const res = await fetch(`${API_BASE}/patients/${id}`, { method: 'DELETE' });
    const json = await res.json();
    return json.success;
  },

  async getThresholds(patientId: string): Promise<ThresholdConfig> {
    const res = await fetch(`${API_BASE}/thresholds/${patientId}`);
    const json = await res.json();
    return json.data;
  },

  async saveThresholds(config: Partial<ThresholdConfig>): Promise<ThresholdConfig> {
    const res = await fetch(`${API_BASE}/thresholds`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });
    const json = await res.json();
    return json.data;
  },

  async getSessions(patientId?: string): Promise<MonitoringSession[]> {
    const url = patientId ? `${API_BASE}/sessions?patient_id=${patientId}` : `${API_BASE}/sessions`;
    const res = await fetch(url);
    const json = await res.json();
    return json.data || [];
  },

  async startSession(patientId: string, title?: string, notes?: string): Promise<MonitoringSession> {
    const res = await fetch(`${API_BASE}/sessions/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ patient_id: patientId, title, notes }),
    });
    const json = await res.json();
    return json.data;
  },

  async stopSession(sessionId: string): Promise<MonitoringSession> {
    const res = await fetch(`${API_BASE}/sessions/stop`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId }),
    });
    const json = await res.json();
    return json.data;
  },

  async deleteSession(sessionId: string): Promise<boolean> {
    const res = await fetch(`${API_BASE}/sessions/${sessionId}`, {
      method: 'DELETE',
    });
    const json = await res.json();
    return json.success;
  },

  async clearAllSessions(patientId?: string): Promise<boolean> {
    const url = patientId ? `${API_BASE}/sessions?patient_id=${patientId}` : `${API_BASE}/sessions`;
    const res = await fetch(url, {
      method: 'DELETE',
    });
    const json = await res.json();
    return json.success;
  },

  async getAlerts(patientId?: string): Promise<AlertEvent[]> {
    const url = patientId ? `${API_BASE}/alerts?patient_id=${patientId}` : `${API_BASE}/alerts`;
    const res = await fetch(url);
    const json = await res.json();
    return json.data || [];
  },

  async deleteAlert(alertId: string): Promise<boolean> {
    const res = await fetch(`${API_BASE}/alerts/${alertId}`, {
      method: 'DELETE',
    });
    const json = await res.json();
    return json.success;
  },

  async clearAllAlerts(patientId?: string): Promise<boolean> {
    const url = patientId ? `${API_BASE}/alerts?patient_id=${patientId}` : `${API_BASE}/alerts`;
    const res = await fetch(url, {
      method: 'DELETE',
    });
    const json = await res.json();
    return json.success;
  },

  async triggerHaptic(durationMs = 1500, reason = 'MANUAL_TRIGGER') {
    const res = await fetch(`${API_BASE}/alerts/trigger`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ duration_ms: durationMs, reason }),
    });
    return res.json();
  },

  async testHardware(testType: string, durationMs?: number) {
    const res = await fetch(`${API_BASE}/hardware/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ test_type: testType, duration_ms: durationMs }),
    });
    return res.json();
  },

  async getNotes(patientId?: string): Promise<ClinicalNote[]> {
    const url = patientId ? `${API_BASE}/notes?patient_id=${patientId}` : `${API_BASE}/notes`;
    const res = await fetch(url);
    const json = await res.json();
    return json.data || [];
  },

  async addNote(note: Partial<ClinicalNote>): Promise<ClinicalNote> {
    const res = await fetch(`${API_BASE}/notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(note),
    });
    const json = await res.json();
    return json.data;
  },

  async setSimulatorMode(mode: string, overrides?: any) {
    const res = await fetch(`${API_BASE}/simulator/mode`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode, overrides }),
    });
    return res.json();
  },

  // --- Auth API ---
  async login(email: string, password?: string): Promise<AuthResponse> {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    return res.json();
  },

  async quickLogin(role: UserRole): Promise<AuthResponse> {
    const res = await fetch(`${API_BASE}/auth/quick-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role }),
    });
    return res.json();
  },

  async getUsers(): Promise<UserAccount[]> {
    const res = await fetch(`${API_BASE}/auth/users`);
    const json = await res.json();
    return json.data || [];
  },

  async registerUser(userData: Partial<UserAccount>): Promise<UserAccount> {
    const res = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(userData),
    });
    const json = await res.json();
    return json.data;
  },
};
