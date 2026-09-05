import { useState, useEffect, useCallback } from 'react';
import { api } from '@/services/api';

export interface TelemetryTick {
  t: number;
  timeStr: string;
  bpm: number;
  gsr: number;
  gsrRaw: number;
  motion: number;
  ax: number;
  ay: number;
  az: number;
  gx: number;
  gy: number;
  gz: number;
  spo2: number;
  batteryPct: number;
  batteryVolt: number;
  hapticActive: boolean;
  disregulation: boolean;
  state: string;
}

export interface LiveAlert {
  id: string | number;
  ts: string;
  msg: string;
  severity?: string;
  type?: string;
}

export interface SerialLogItem {
  id: string;
  timestamp: number;
  timeStr: string;
  topic: string;
  payload: string;
  source: 'ESP32_HARDWARE' | 'MQTT_LOCAL' | 'MQTT_CLOUD' | 'BACKEND_WEB';
  level: 'INFO' | 'SUCCESS' | 'WARN' | 'ERROR' | 'CMD';
}

const MAX_POINTS = 30;

const EMPTY_LATEST: TelemetryTick = {
  t: 0,
  timeStr: '--:--:--',
  bpm: 0,
  gsr: 0,
  gsrRaw: 0,
  motion: 0,
  ax: 0,
  ay: 0,
  az: 0,
  gx: 0,
  gy: 0,
  gz: 0,
  spo2: 0,
  batteryPct: 0,
  batteryVolt: 0,
  hapticActive: false,
  disregulation: false,
  state: 'OFFLINE',
};

// ==================== SINGLETON WEBSOCKET MANAGER ====================
interface StreamState {
  isConnected: boolean;
  series: TelemetryTick[];
  latest: TelemetryTick;
  alerts: LiveAlert[];
  serialLogs: SerialLogItem[];
  hapticActive: boolean;
  simulatorMode: string;
  mqttConnected: boolean;
  activeSession: any;
  biofeedbackSnapshot: any | null;
}

let globalState: StreamState = {
  isConnected: false,
  series: [],
  latest: EMPTY_LATEST,
  alerts: [],
  serialLogs: [],
  hapticActive: false,
  simulatorMode: 'HARDWARE_STANDBY',
  mqttConnected: false,
  activeSession: null,
  biofeedbackSnapshot: null,
};

const listeners = new Set<(s: StreamState) => void>();
let globalSocket: WebSocket | null = null;
let reconnectTimer: NodeJS.Timeout | null = null;
let tickCounter = 0;
let isConnecting = false;

function emit() {
  listeners.forEach((fn) => fn({ ...globalState }));
}

function connectGlobalWebSocket() {
  if (typeof window === 'undefined') return;
  if (globalSocket && (globalSocket.readyState === WebSocket.OPEN || globalSocket.readyState === WebSocket.CONNECTING)) {
    return;
  }
  if (isConnecting) return;
  isConnecting = true;

  try {
    const wsUrl = `ws://${window.location.hostname || 'localhost'}:5001`;
    const ws = new WebSocket(wsUrl);
    globalSocket = ws;

    ws.onopen = () => {
      isConnecting = false;
      globalState.isConnected = true;
      emit();
      console.log('⚡ [WebSocket] Connected to backend on port 5001');
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);

        if (msg.type === 'INITIAL_STATE') {
          if (msg.simulatorMode) globalState.simulatorMode = msg.simulatorMode;
          if (msg.mqttConnected !== undefined) globalState.mqttConnected = msg.mqttConnected;
          if (msg.latestTelemetry && (msg.latestTelemetry.gsr?.microsiemens > 0 || msg.latestTelemetry.ppg?.bpm > 0)) {
            const raw = msg.latestTelemetry;
            globalState.latest = {
              t: tickCounter++,
              timeStr: new Date(raw.timestamp || Date.now()).toLocaleTimeString('en-GB', { hour12: false }),
              bpm: Number(raw.ppg?.bpm || 0),
              gsr: Number(raw.gsr?.microsiemens || 0),
              gsrRaw: Number(raw.gsr?.raw || 0),
              motion: Number(raw.imu?.fidget_score || 0),
              ax: Number(raw.imu?.ax || 0),
              ay: Number(raw.imu?.ay || 0),
              az: Number(raw.imu?.az || 0),
              gx: Number(raw.imu?.gx || 0),
              gy: Number(raw.imu?.gy || 0),
              gz: Number(raw.imu?.gz || 0),
              spo2: Number(raw.ppg?.spo2 || 0),
              batteryPct: Number(raw.battery?.percentage || 0),
              batteryVolt: Number(raw.battery?.voltage || 0),
              hapticActive: !!raw.system?.haptic_active,
              disregulation: !!raw.system?.disregulation_flag,
              state: raw.system?.state || 'MONITORING',
            };
          }
          emit();
        }

        if (msg.type === 'TELEMETRY_TICK' && msg.data) {
          const raw = msg.data;
          const now = new Date(raw.timestamp || Date.now());
          const timeStr = now.toLocaleTimeString('en-GB', { hour12: false });

          const tick: TelemetryTick = {
            t: tickCounter++,
            timeStr,
            bpm: Number(raw.ppg?.bpm || 0),
            gsr: Number(raw.gsr?.microsiemens || 0),
            gsrRaw: Number(raw.gsr?.raw || 0),
            motion: Number(raw.imu?.fidget_score || 0),
            ax: Number(raw.imu?.ax || 0),
            ay: Number(raw.imu?.ay || 0),
            az: Number(raw.imu?.az || 0),
            gx: Number(raw.imu?.gx || 0),
            gy: Number(raw.imu?.gy || 0),
            gz: Number(raw.imu?.gz || 0),
            spo2: Number(raw.ppg?.spo2 || 0),
            batteryPct: Number(raw.battery?.percentage || 0),
            batteryVolt: Number(raw.battery?.voltage || 0),
            hapticActive: !!raw.system?.haptic_active,
            disregulation: !!raw.system?.disregulation_flag,
            state: raw.system?.state || 'MONITORING',
          };

          globalState.latest = tick;
          globalState.hapticActive = tick.hapticActive;
          globalState.series = [...globalState.series.slice(-MAX_POINTS + 1), tick];
          emit();
        }

        if (msg.type === 'ALERT_EVENT' && msg.data) {
          const a = msg.data;
          const newAlert: LiveAlert = {
            id: a.id || Date.now(),
            ts: new Date(a.timestamp || Date.now()).toLocaleTimeString('en-GB', { hour12: false }),
            msg: a.trigger_reason || 'Disregulasi Fisiologis Terdeteksi',
            severity: a.severity || 'HIGH',
            type: a.type || 'DISREGULATION',
          };
          globalState.alerts = [newAlert, ...globalState.alerts].slice(0, 10);
          globalState.hapticActive = true;
          emit();
        }

        if (msg.type === 'SERIAL_LOG' && msg.data) {
          const item: SerialLogItem = {
            id: `${Date.now()}-${Math.random()}`,
            timestamp: msg.data.timestamp || Date.now(),
            timeStr: msg.data.timeStr || new Date().toLocaleTimeString('id-ID', { hour12: false }),
            topic: msg.data.topic || 'mqtt/raw',
            payload: typeof msg.data.payload === 'object' ? JSON.stringify(msg.data.payload) : String(msg.data.payload),
            source: msg.data.source || 'MQTT_CLOUD',
            level: msg.data.level || 'INFO',
          };
          globalState.serialLogs = [...globalState.serialLogs.slice(-250), item];
          emit();
        }

        if (msg.type === 'SIMULATOR_MODE_CHANGED') {
          globalState.simulatorMode = msg.mode;
          emit();
        }

        if (msg.type === 'SESSION_STARTED') {
          globalState.activeSession = msg.session;
          emit();
        }

        if (msg.type === 'SESSION_STOPPED') {
          globalState.activeSession = null;
          emit();
        }

        if (msg.type === 'MQTT_DEVICE_CONNECTED') {
          globalState.mqttConnected = true;
          emit();
        }

        if (msg.type === 'MQTT_DEVICE_DISCONNECTED') {
          globalState.mqttConnected = false;
          emit();
        }

        // ── Backend Decision Engine: snapshot analisis realtime ──
        if (msg.type === 'BIOFEEDBACK_DECISION' && msg.data) {
          globalState.biofeedbackSnapshot = msg.data;
          // Jika engine memicu Biofeedback Aktif, sinkronkan ke alerts
          if (msg.data.decision?.state === 'Biofeedback Aktif') {
            const engineAlert: LiveAlert = {
              id: `engine-${Date.now()}`,
              ts: new Date(msg.data.timestamp || Date.now()).toLocaleTimeString('id-ID', { hour12: false }),
              msg: msg.data.decision?.reasoning || 'Biofeedback Aktif — Haptic terkirim ke ESP32',
              severity: 'HIGH',
              type: 'MULTISENSOR_DISREGULATION',
            };
            globalState.alerts = [engineAlert, ...globalState.alerts].slice(0, 10);
          }
          emit();
        }
      } catch (err) {
        console.error('[WebSocket] Failed to parse message:', err);
      }
    };

    ws.onerror = () => {
      isConnecting = false;
      globalState.isConnected = false;
      emit();
    };

    ws.onclose = () => {
      isConnecting = false;
      globalState.isConnected = false;
      globalSocket = null;
      emit();
      if (!reconnectTimer) {
        reconnectTimer = setTimeout(() => {
          reconnectTimer = null;
          connectGlobalWebSocket();
        }, 3000);
      }
    };
  } catch (err) {
    isConnecting = false;
    globalState.isConnected = false;
    emit();
    if (!reconnectTimer) {
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        connectGlobalWebSocket();
      }, 3000);
    }
  }
}

export function useRealtimeStream() {
  const [state, setState] = useState<StreamState>(globalState);

  useEffect(() => {
    listeners.add(setState);
    connectGlobalWebSocket();
    setState(globalState);

    return () => {
      listeners.delete(setState);
    };
  }, []);

  const sendSerialCommand = useCallback((cmd: string) => {
    if (globalSocket && globalSocket.readyState === WebSocket.OPEN) {
      globalSocket.send(
        JSON.stringify({
          action: 'SEND_SERIAL_COMMAND',
          cmd,
        })
      );
    }
  }, []);

  const clearSerialLogs = useCallback(() => {
    globalState.serialLogs = [];
    emit();
  }, []);

  const triggerHaptic = useCallback((durationMs = 1500, reason = 'MANUAL_TRIGGER') => {
    if (globalSocket && globalSocket.readyState === WebSocket.OPEN) {
      globalSocket.send(
        JSON.stringify({
          action: 'TRIGGER_HAPTIC',
          duration_ms: durationMs,
          reason,
        })
      );
    }
  }, []);

  const startSession = useCallback(async (patientId: string, title?: string, notes?: string) => {
    if (globalSocket && globalSocket.readyState === WebSocket.OPEN) {
      globalSocket.send(
        JSON.stringify({
          action: 'START_SESSION',
          patient_id: patientId,
          title,
          notes,
        })
      );
    }
    // Also trigger REST API
    try {
      const res = await api.startSession(patientId, title, notes);
      if (res) {
        globalState.activeSession = res;
        emit();
      }
    } catch (e) {
      console.warn('REST startSession fallback error:', e);
    }
  }, []);

  const stopSession = useCallback(async (sessionId: string) => {
    // 1. Instantly flip local state to stopped
    globalState.activeSession = null;
    emit();

    // 2. Send via WebSocket
    if (globalSocket && globalSocket.readyState === WebSocket.OPEN) {
      globalSocket.send(
        JSON.stringify({
          action: 'STOP_SESSION',
          session_id: sessionId,
        })
      );
    }

    // 3. Call REST endpoint as authoritative guarantee
    try {
      await api.stopSession(sessionId);
    } catch (e) {
      console.warn('REST stopSession error:', e);
    }
  }, []);

  return {
    isConnected: state.isConnected,
    series: state.series,
    latest: state.latest,
    alerts: state.alerts,
    serialLogs: state.serialLogs,
    hapticActive: state.hapticActive,
    simulatorMode: state.simulatorMode,
    mqttConnected: state.mqttConnected,
    activeSession: state.activeSession,
    biofeedbackSnapshot: state.biofeedbackSnapshot,
    triggerHaptic,
    startSession,
    stopSession,
    sendSerialCommand,
    clearSerialLogs,
  };
}
