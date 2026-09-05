import { WebSocketServer, WebSocket } from 'ws';
import http from 'http';
import { TelemetryPayload, AlertEvent, MonitoringSession } from '../types/index.js';
import { telemetryManager } from '../simulator/esp32Simulator.js';
import { db } from '../db/database.js';
import { EmbeddedMQTTBroker } from '../mqtt/broker.js';

export interface SerialLogPacket {
  timestamp: number;
  timeStr: string;
  topic: string;
  payload: string;
  source: 'ESP32_HARDWARE' | 'MQTT_LOCAL' | 'MQTT_CLOUD' | 'BACKEND_WEB';
  level: 'INFO' | 'SUCCESS' | 'WARN' | 'ERROR' | 'CMD';
}

export class RealtimeWebSocketServer {
  private wss: WebSocketServer;
  private mqttBroker: EmbeddedMQTTBroker | null = null;

  constructor(server: http.Server, mqttBroker?: EmbeddedMQTTBroker) {
    this.wss = new WebSocketServer({ server });
    this.mqttBroker = mqttBroker || null;
    this.setupServer();
  }

  public setMQTTBroker(broker: EmbeddedMQTTBroker) {
    this.mqttBroker = broker;
  }

  private setupServer() {
    this.wss.on('connection', (ws: WebSocket, req) => {
      console.log(`[WebSocket] Dashboard terhubung dari: ${req.socket.remoteAddress}`);

      // Send initial hello payload with latest real telemetry and system status
      const initialPayload = {
        type: 'INITIAL_STATE',
        telemetry: telemetryManager.getLatestTelemetry(),
        patients: db.getPatients(),
        activePatient: db.getPatients()[0] || null,
        mqttConnected: this.mqttBroker ? this.mqttBroker.getConnectedClients().length > 0 : false,
        mqttClients: this.mqttBroker ? this.mqttBroker.getConnectedClients() : [],
        timestamp: Date.now()
      };
      ws.send(JSON.stringify(initialPayload));

      ws.on('message', (message: string) => {
        try {
          const parsed = JSON.parse(message.toString());
          this.handleClientMessage(ws, parsed);
        } catch (err) {
          console.warn('[WebSocket] Invalid JSON message from client:', err);
        }
      });

      ws.on('close', () => {
        console.log('[WebSocket] Dashboard disconnected');
      });

      ws.on('error', (err) => {
        console.error('[WebSocket] Socket error:', err);
      });
    });
  }

  private handleClientMessage(ws: WebSocket, msg: any) {
    const { action, payload, type, cmd } = msg;

    // Handle both action or type style
    const act = action || type;

    switch (act) {
      case 'TRIGGER_HAPTIC':
        const duration = payload?.duration_ms || msg.duration_ms || 1500;
        telemetryManager.triggerHaptic(duration, 'MANUAL_TRIGGER');
        if (this.mqttBroker) {
          this.mqttBroker.publishCommand('esp32-band-001', {
            cmd: 'TRIGGER_HAPTIC',
            duration_ms: duration,
            intensity_pct: 80
          });
        }
        break;

      case 'SEND_SERIAL_COMMAND':
      case 'SEND_COMMAND':
        const commandStr = cmd || payload?.cmd || 'TEST_ALL_HARDWARE';
        console.log(`📡 [Serial Console] Menerima perintah online dari web: ${commandStr}`);
        if (this.mqttBroker) {
          this.mqttBroker.publishCommand('esp32-band-001', {
            cmd: commandStr,
            timestamp: Date.now(),
            origin: 'WEB_SERIAL_CONSOLE'
          });
        }
        this.broadcastSerialLog({
          timestamp: Date.now(),
          timeStr: new Date().toLocaleTimeString('id-ID', { hour12: false }),
          topic: 'umsu/adhd/2209020111/esp32-band-001/cmd',
          payload: `[WEB TRANSMIT] >> Perintah terkirim ke ESP32: "${commandStr}"`,
          source: 'BACKEND_WEB',
          level: 'CMD'
        });
        break;

      case 'SET_ACTIVE_PATIENT':
        if (payload?.patient_id) {
          telemetryManager.setActivePatient(payload.patient_id);
          this.broadcast({
            type: 'ACTIVE_PATIENT_CHANGED',
            patient_id: payload.patient_id
          });
        }
        break;

      case 'START_SESSION':
        const startPatientId = msg.patient_id || payload?.patient_id || 'patient-1786778779697';
        const startTitle = msg.title || payload?.title || 'Sesi Monitoring & Biofeedback';
        const startNotes = msg.notes || payload?.notes || '';
        const newSession = db.saveSession({
          id: `sess-${Date.now()}`,
          patient_id: startPatientId,
          title: startTitle,
          start_time: new Date().toISOString(),
          end_time: null,
          duration_seconds: 0,
          status: 'ACTIVE',
          avg_gsr: 0,
          peak_gsr: 0,
          avg_bpm: 0,
          peak_bpm: 0,
          alert_count: 0,
          notes: startNotes
        });
        telemetryManager.setActiveSession(newSession.id);
        this.broadcast({
          type: 'SESSION_STARTED',
          session: newSession
        });
        break;

      case 'STOP_SESSION':
        const stopId = msg.session_id || payload?.session_id || telemetryManager.getLatestTelemetry()?.system?.session_id;
        let stoppedSession: MonitoringSession | null = null;
        if (stopId) {
          const session = db.getSessionById(stopId);
          if (session) {
            session.end_time = new Date().toISOString();
            session.status = 'COMPLETED';
            const dur = Math.round((new Date(session.end_time).getTime() - new Date(session.start_time).getTime()) / 1000);
            session.duration_seconds = Math.max(1, dur);
            db.saveSession(session);
            stoppedSession = session;
          }
        }
        // Also complete any remaining ACTIVE sessions
        const allActive = db.getSessions().filter(s => s.status === 'ACTIVE');
        allActive.forEach(s => {
          s.end_time = new Date().toISOString();
          s.status = 'COMPLETED';
          const dur = Math.round((new Date(s.end_time).getTime() - new Date(s.start_time).getTime()) / 1000);
          s.duration_seconds = Math.max(1, dur);
          db.saveSession(s);
          if (!stoppedSession) stoppedSession = s;
        });

        telemetryManager.setActiveSession(null);
        this.broadcast({
          type: 'SESSION_STOPPED',
          session: stoppedSession
        });
        break;

      case 'PING':
        ws.send(JSON.stringify({ type: 'PONG', timestamp: Date.now() }));
        break;
    }
  }

  public broadcast(data: any) {
    const message = typeof data === 'string' ? data : JSON.stringify(data);
    this.wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  }

  public broadcastTelemetry(telemetry: TelemetryPayload) {
    this.broadcast({
      type: 'TELEMETRY_TICK',
      data: telemetry
    });
  }

  public broadcastAlert(alert: AlertEvent) {
    this.broadcast({
      type: 'ALERT_EVENT',
      data: alert
    });
  }

  public broadcastSerialLog(log: SerialLogPacket) {
    this.broadcast({
      type: 'SERIAL_LOG',
      data: log
    });
  }

  public getConnectedClientsCount(): number {
    return this.wss.clients.size;
  }
}
