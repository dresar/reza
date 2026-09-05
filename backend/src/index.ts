import express from 'express';
import http from 'http';
import cors from 'cors';
import { EmbeddedMQTTBroker } from './mqtt/broker.js';
import { RealtimeWebSocketServer } from './websocket/server.js';
import { createApiRouter } from './routes/api.js';
import { simulator } from './simulator/esp32Simulator.js';
import { decisionEngine } from './engine/BiofeedbackDecisionEngine.js';

const PORT_HTTP = process.env.PORT ? parseInt(process.env.PORT) : 5001;
const PORT_MQTT = process.env.MQTT_PORT ? parseInt(process.env.MQTT_PORT) : 1883;

async function bootstrap() {
  console.log('====================================================');
  console.log('🚀 Starting ADHD Wearable IoT Multisensor System');
  console.log('   Thesis: Muhammad Reza (2209020111) - TI UMSU 2026');
  console.log('====================================================');

  const app = express();
  app.use(cors({ origin: '*' }));
  app.use(express.json());

  const server = http.createServer(app);

  let wsServer: RealtimeWebSocketServer;

  // 0. Set up decision engine callbacks (before MQTT starts)
  // Active patient ID — defaults to the first patient in DB, updated when session starts
  let activePatientId = 'patient-1786778779697';

  decisionEngine.onHapticRequired = (patientId, durationMs, reason) => {
    console.log(`🔴 [DecisionEngine] HAPTIC TRIGGER → patient: ${patientId}, duration: ${durationMs}ms, reason: ${reason}`);
    mqttBroker?.publishCommand('esp32-band-001', {
      cmd: 'TRIGGER_HAPTIC',
      duration_ms: durationMs,
      reason,
      source: 'BACKEND_DECISION_ENGINE',
    });
    wsServer?.broadcastSerialLog({
      timestamp: Date.now(),
      timeStr: new Date().toLocaleTimeString('id-ID', { hour12: false }),
      topic: 'engine/haptic',
      payload: `[ENGINE] 🔴 BIOFEEDBACK AKTIF → ${reason} | Haptic ${durationMs}ms dikirim ke ESP32`,
      source: 'BACKEND_WEB',
      level: 'WARN',
    });
  };

  decisionEngine.onDecision = (snapshot) => {
    wsServer?.broadcast({
      type: 'BIOFEEDBACK_DECISION',
      data: snapshot,
    });
  };

  // 1. Initialize Embedded Aedes MQTT Broker (Port 1883)
  const mqttBroker = new EmbeddedMQTTBroker(PORT_MQTT, {
    onTelemetryReceived: (telemetry) => {
      // a. Broadcast raw telemetry to WebSocket for realtime charts
      wsServer?.broadcastTelemetry(telemetry);

      // b. [BACKEND ENGINE] Process through BiofeedbackDecisionEngine
      try {
        decisionEngine.processTelemetry(telemetry, activePatientId);
      } catch (err) {
        console.error('[DecisionEngine] Processing error:', err);
      }
    },
    onAlertReceived: (alert) => {
      wsServer?.broadcastAlert(alert);
    },
    onDeviceConnected: (clientId) => {
      wsServer?.broadcast({
        type: 'MQTT_DEVICE_CONNECTED',
        clientId,
        timestamp: Date.now()
      });
      wsServer?.broadcastSerialLog({
        timestamp: Date.now(),
        timeStr: new Date().toLocaleTimeString('id-ID', { hour12: false }),
        topic: 'system/connection',
        payload: `[DEVICE CONNECTED] Klien ${clientId} terhubung ke broker MQTT.`,
        source: 'MQTT_LOCAL',
        level: 'SUCCESS'
      });
    },
    onDeviceDisconnected: (clientId) => {
      wsServer?.broadcast({
        type: 'MQTT_DEVICE_DISCONNECTED',
        clientId,
        timestamp: Date.now()
      });
      wsServer?.broadcastSerialLog({
        timestamp: Date.now(),
        timeStr: new Date().toLocaleTimeString('id-ID', { hour12: false }),
        topic: 'system/connection',
        payload: `[DEVICE DISCONNECTED] Klien ${clientId} terputus dari broker.`,
        source: 'MQTT_LOCAL',
        level: 'WARN'
      });
    },
    onRawPacketReceived: (pkt) => {
      // Stream raw MQTT packets to Online Serial Monitor without saving to database
      let lvl: 'INFO' | 'SUCCESS' | 'WARN' | 'ERROR' | 'CMD' = 'INFO';
      if (pkt.topic.includes('events') || pkt.topic.includes('alert')) lvl = 'WARN';
      else if (pkt.topic.includes('cmd')) lvl = 'CMD';
      else if (pkt.topic.includes('serial')) lvl = 'SUCCESS';

      wsServer?.broadcastSerialLog({
        timestamp: Date.now(),
        timeStr: new Date().toLocaleTimeString('id-ID', { hour12: false }),
        topic: pkt.topic,
        payload: pkt.payload,
        source: pkt.source === 'CLOUD' ? 'MQTT_CLOUD' : 'MQTT_LOCAL',
        level: lvl
      });
    }
  });

  await mqttBroker.start();

  // 2. Initialize Realtime WebSocket Server (Port 5001)
  wsServer = new RealtimeWebSocketServer(server, mqttBroker);

  // 3. Connect Simulator to WebSocket & MQTT Broker
  simulator.onTick((telemetry) => {
    wsServer.broadcastTelemetry(telemetry);
  });

  simulator.onAlert((alert) => {
    wsServer.broadcastAlert(alert);
  });

  // 4. Attach REST API Routes
  app.use('/api', createApiRouter(mqttBroker, wsServer));

  // Root status endpoint
  app.get('/', (req, res) => {
    res.json({
      name: 'ADHD Wearable IoT Backend',
      status: 'ONLINE',
      mqtt_port: PORT_MQTT,
      ws_port: PORT_HTTP,
      endpoints: {
        status: '/api/status',
        telemetry: '/api/telemetry/latest',
        patients: '/api/patients',
        sessions: '/api/sessions',
        thresholds: '/api/thresholds/patient-001',
        alerts: '/api/alerts',
        notes: '/api/notes'
      }
    });
  });

  // 5. Start HTTP & WebSocket Server
  server.listen(PORT_HTTP, () => {
    console.log(`📡 [REST & WebSocket] Server running at http://localhost:${PORT_HTTP}`);
    console.log(`⚡ [WebSocket] Realtime Stream listening on ws://localhost:${PORT_HTTP}`);
    console.log(`🔌 [MQTT Broker] Embedded Broker active on tcp://localhost:${PORT_MQTT}`);
    console.log('✨ [Online Serial Monitor] In-Memory Packet Streamer is READY');
    console.log('====================================================\n');
  });
}

bootstrap().catch((err) => {
  console.error('Fatal backend startup error:', err);
  process.exit(1);
});
