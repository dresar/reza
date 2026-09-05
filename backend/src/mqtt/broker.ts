import net from 'net';
import Aedes from 'aedes';
import mqtt, { MqttClient } from 'mqtt';
import { TelemetryPayload, AlertEvent } from '../types/index.js';
import { db } from '../db/database.js';
import { telemetryManager } from '../simulator/esp32Simulator.js';

export interface MQTTBrokerCallbacks {
  onTelemetryReceived?: (payload: TelemetryPayload) => void;
  onAlertReceived?: (alert: AlertEvent) => void;
  onDeviceConnected?: (clientId: string) => void;
  onDeviceDisconnected?: (clientId: string) => void;
  onRawPacketReceived?: (packet: { topic: string; payload: string; source: 'LOCAL' | 'CLOUD' }) => void;
}

export class EmbeddedMQTTBroker {
  private aedesInstance: any;
  private server: net.Server;
  private port: number;
  private connectedClients = new Set<string>();
  private callbacks: MQTTBrokerCallbacks = {};

  // Cloud Public Broker Bridge (for remote ESP32 on different WiFi/networks)
  private cloudClient: MqttClient | null = null;
  private publicBrokerUrl = 'mqtt://broker.emqx.io:1883';
  private publicNamespace = 'umsu/adhd/2209020111';

  constructor(port = 1883, callbacks: MQTTBrokerCallbacks = {}) {
    this.port = port;
    this.callbacks = callbacks;
    this.aedesInstance = new (Aedes as any)();
    this.server = net.createServer(this.aedesInstance.handle);
    this.setupListeners();
    this.setupCloudBridge();
  }

  private setupListeners() {
    this.aedesInstance.on('client', (client: any) => {
      const clientId = client ? client.id : 'unknown';
      console.log(`🔌 [MQTT Local] Modul Perangkat Terhubung Lokal: ${clientId}`);
      if (client && client.id) {
        this.connectedClients.add(client.id);
        this.callbacks.onDeviceConnected?.(client.id);
      }
    });

    this.aedesInstance.on('clientDisconnect', (client: any) => {
      const clientId = client ? client.id : 'unknown';
      console.log(`❌ [MQTT Local] Modul Perangkat Terputus Lokal: ${clientId}`);
      if (client && client.id) {
        this.connectedClients.delete(client.id);
        this.callbacks.onDeviceDisconnected?.(client.id);
      }
    });

    this.aedesInstance.on('publish', (packet: any, client: any) => {
      if (!packet || !packet.topic) return;
      const topic = packet.topic as string;
      const payloadStr = packet.payload ? packet.payload.toString() : '';

      // Ignore internal $SYS topics
      if (topic.startsWith('$SYS/')) return;

      this.processIncomingMqttPacket(topic, payloadStr, 'LOCAL');
    });
  }

  private setupCloudBridge() {
    console.log(`🌐 [MQTT Cloud Bridge] Menghubungkan ke Public Cloud Broker: ${this.publicBrokerUrl}...`);
    try {
      this.cloudClient = mqtt.connect(this.publicBrokerUrl, {
        clientId: `backend-dashboard-reza-${Date.now()}`,
        clean: true,
        reconnectPeriod: 3000,
        connectTimeout: 10000,
      });

      this.cloudClient.on('connect', () => {
        console.log(`✅ [MQTT Cloud Bridge] Terhubung ke Public Cloud Broker (${this.publicBrokerUrl})!`);
        console.log(`📡 [MQTT Cloud Bridge] Subscribed ke namespace public: ${this.publicNamespace}/#`);
        this.cloudClient?.subscribe(`${this.publicNamespace}/#`);
        this.connectedClients.add('public-cloud-bridge');
      });

      this.cloudClient.on('message', (topic: string, message: Buffer) => {
        const payloadStr = message.toString();
        this.processIncomingMqttPacket(topic, payloadStr, 'CLOUD');
      });

      this.cloudClient.on('error', (err) => {
        console.warn('⚠️ [MQTT Cloud Bridge] Cloud broker warning:', err.message);
      });

      this.cloudClient.on('offline', () => {
        console.log('⚠️ [MQTT Cloud Bridge] Cloud broker offline, mencoba reconnect otomatis...');
      });
    } catch (e) {
      console.error('❌ [MQTT Cloud Bridge] Gagal inisialisasi cloud broker:', e);
    }
  }

  private processIncomingMqttPacket(topic: string, payloadStr: string, source: 'LOCAL' | 'CLOUD') {
    // 1. Always notify raw packet callback for Online Serial Monitor Stream (Not saved to DB)
    this.callbacks.onRawPacketReceived?.({ topic, payload: payloadStr, source });

    // 2. Handle telemetry topics:
    if (topic.includes('/telemetry') || topic.endsWith('/telemetry') || topic === 'esp32/sensors') {
      try {
        const parsed = JSON.parse(payloadStr);
        const telemetry = telemetryManager.processHardwareTelemetry(parsed);
        this.callbacks.onTelemetryReceived?.(telemetry);
      } catch (err: any) {
        console.warn(`[MQTT ${source}] Incomplete or non-JSON telemetry packet (${payloadStr.length} chars): ${err?.message || err}`);
      }
    }

    // 3. Handle event / alert topics
    if (topic.includes('/events') || topic.includes('/alerts')) {
      try {
        const alert: AlertEvent = JSON.parse(payloadStr);
        db.addAlert(alert);
        this.callbacks.onAlertReceived?.(alert);
      } catch (err: any) {
        console.warn(`[MQTT ${source}] Non-JSON event packet (${payloadStr.length} chars): ${err?.message || err}`);
      }
    }
  }

  public start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server.listen(this.port, () => {
        console.log(`🔌 [MQTT Broker] Siap menerima koneksi ESP32-C3 pada port TCP lokal ${this.port}`);
        resolve();
      });
      this.server.on('error', (err: any) => {
        console.error('[MQTT Broker] Server error:', err);
        reject(err);
      });
    });
  }

  public publishCommand(deviceId: string, command: object) {
    const payloadStr = JSON.stringify(command);
    const localTopic = `adhd/wearable/${deviceId}/cmd`;
    const publicTopic = `${this.publicNamespace}/${deviceId}/cmd`;

    // 1. Publish to local broker
    const buffer = Buffer.from(payloadStr);
    this.aedesInstance.publish({
      topic: localTopic,
      payload: buffer,
      qos: 1,
      retain: false
    }, (err: any) => {
      if (err) console.error(`[MQTT Local] Failed to publish command to ${localTopic}:`, err);
      else console.log(`[MQTT Local] Published command to ${localTopic}:`, command);
    });

    // 2. Publish to Public Cloud Broker (for remote ESP32 on different network)
    if (this.cloudClient && this.cloudClient.connected) {
      this.cloudClient.publish(publicTopic, payloadStr, { qos: 1 }, (err) => {
        if (err) console.error(`[MQTT Cloud] Failed to publish command to ${publicTopic}:`, err);
        else console.log(`[MQTT Cloud] Published command to ${publicTopic}:`, command);
      });
    }
  }

  public getConnectedClients(): string[] {
    return Array.from(this.connectedClients);
  }

  public isHealthy(): boolean {
    return this.server.listening;
  }
}
