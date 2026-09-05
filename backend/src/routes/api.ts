import { Router, Request, Response } from 'express';
import { db } from '../db/database.js';
import { telemetryManager } from '../simulator/esp32Simulator.js';
import { EmbeddedMQTTBroker } from '../mqtt/broker.js';
import { RealtimeWebSocketServer } from '../websocket/server.js';
import { PatientProfile, ThresholdConfig, MonitoringSession, ClinicalNote } from '../types/index.js';
import { decisionEngine } from '../engine/BiofeedbackDecisionEngine.js';

export function createApiRouter(mqttBroker: EmbeddedMQTTBroker, wsServer: RealtimeWebSocketServer): Router {
  const router = Router();

  // Status & Health Check
  router.get('/status', (req: Request, res: Response) => {
    res.json({
      success: true,
      service: 'ADHD Wearable IoT Backend',
      version: '1.0.0',
      system_time: new Date().toISOString(),
      mqtt: {
        healthy: mqttBroker.isHealthy(),
        port: 1883,
        connected_clients: mqttBroker.getConnectedClients(),
        hardware_esp32_connected: mqttBroker.getConnectedClients().some(id => id.toLowerCase().includes('esp32'))
      },
      websocket: {
        connected_dashboards: wsServer.getConnectedClientsCount(),
        port: 5001
      },
      hardware: {
        latest_telemetry: telemetryManager.getLatestTelemetry()
      }
    });
  });

  // Telemetry Latest
  router.get('/telemetry/latest', (req: Request, res: Response) => {
    res.json({
      success: true,
      data: telemetryManager.getLatestTelemetry()
    });
  });

  // Telemetry History
  router.get('/telemetry/history', (req: Request, res: Response) => {
    const limit = parseInt(req.query.limit as string) || 50;
    res.json({
      success: true,
      data: db.getTelemetryHistory(limit)
    });
  });

  // --- AUTHENTICATION ROUTES ---
  router.post('/auth/login', (req: Request, res: Response) => {
    const { email, password } = req.body;
    if (!email) {
      return res.status(400).json({ success: false, message: 'Email wajib diisi' });
    }
    const user = db.authenticate(email, password || '');
    if (!user) {
      return res.status(401).json({ success: false, message: 'Email atau password salah' });
    }
    // Remove password in response
    const { password: _, ...safeUser } = user;
    let linkedPatient = null;
    if (safeUser.linked_patient_id) {
      linkedPatient = db.getPatientById(safeUser.linked_patient_id) || null;
    }
    res.json({
      success: true,
      message: `Selamat datang, ${safeUser.name}`,
      user: safeUser,
      linkedPatient
    });
  });

  router.post('/auth/quick-login', (req: Request, res: Response) => {
    const { role } = req.body; // 'TERAPIS' | 'ORANG_TUA'
    const targetRole = role === 'ORANG_TUA' ? 'ORANG_TUA' : 'TERAPIS';
    const user = db.getUserByRole(targetRole);
    if (!user) {
      return res.status(404).json({ success: false, message: `Akun untuk role ${targetRole} tidak ditemukan` });
    }
    const { password: _, ...safeUser } = user;
    let linkedPatient = null;
    if (safeUser.linked_patient_id) {
      linkedPatient = db.getPatientById(safeUser.linked_patient_id) || null;
    } else if (safeUser.role === 'ORANG_TUA') {
      const allPatients = db.getPatients();
      if (allPatients.length > 0) linkedPatient = allPatients[0];
    }
    res.json({
      success: true,
      message: `Login cepat berhasil sebagai ${safeUser.role === 'TERAPIS' ? 'Terapis / Admin' : 'Orang Tua'}`,
      user: safeUser,
      linkedPatient
    });
  });

  router.get('/auth/users', (req: Request, res: Response) => {
    const users = db.getUsers().map(u => {
      const { password: _, ...safe } = u;
      return safe;
    });
    res.json({ success: true, data: users });
  });

  router.post('/auth/register', (req: Request, res: Response) => {
    const body = req.body;
    if (!body.email || !body.name) {
      return res.status(400).json({ success: false, message: 'Nama dan Email wajib diisi' });
    }
    const newUser = {
      id: body.id || `usr-${Date.now()}`,
      name: body.name,
      email: body.email,
      role: body.role || 'ORANG_TUA',
      password: body.password || 'password123',
      phone: body.phone || '',
      linked_patient_id: body.linked_patient_id,
      title_or_relation: body.title_or_relation || (body.role === 'TERAPIS' ? 'Terapis / Konselor' : 'Orang Tua / Wali'),
      avatar_color: body.avatar_color || '#10B981',
      created_at: new Date().toISOString()
    };
    const saved = db.saveUser(newUser);
    const { password: _, ...safeUser } = saved;
    res.json({ success: true, data: safeUser });
  });

  // Patients CRUD
  router.get('/patients', (req: Request, res: Response) => {
    res.json({
      success: true,
      data: db.getPatients()
    });
  });

  router.get('/patients/:id', (req: Request, res: Response) => {
    const patient = db.getPatientById(String(req.params.id));
    if (!patient) return res.status(404).json({ success: false, message: 'Patient not found' });
    res.json({ success: true, data: patient });
  });

  router.post('/patients', (req: Request, res: Response) => {
    const body = req.body;
    const patientId = body.id || `patient-${Date.now()}`;
    const newPatient: PatientProfile = {
      id: patientId,
      name: body.name,
      nickname: body.nickname || body.name.split(' ')[0],
      age: Number(body.age) || 8,
      gender: body.gender || 'Laki-laki',
      adhd_subtype: body.adhd_subtype || 'Combined Type',
      baseline_gsr: Number(body.baseline_gsr) || 3.5,
      baseline_bpm: Number(body.baseline_bpm) || 80,
      avatar_color: body.avatar_color || '#00D4FF',
      notes: body.notes || '',
      parent_name: body.parent_name || '',
      parent_email: body.parent_email || '',
      parent_phone: body.parent_phone || '',
      parent_user_id: body.parent_user_id || '',
      device_id: body.device_id || 'esp32-band-001',
      created_at: body.created_at || new Date().toISOString()
    };

    // If parent email provided, link/create parent user automatically
    if (body.parent_email) {
      let parentUser = db.getUserByEmail(body.parent_email);
      if (!parentUser) {
        parentUser = {
          id: `usr-ortu-${Date.now()}`,
          name: body.parent_name || `Orang Tua ${newPatient.nickname}`,
          email: body.parent_email,
          role: 'ORANG_TUA',
          password: 'password123',
          phone: body.parent_phone || '',
          linked_patient_id: patientId,
          title_or_relation: `Orang Tua / Wali dari ${newPatient.name}`,
          avatar_color: '#10B981',
          created_at: new Date().toISOString()
        };
        db.saveUser(parentUser);
      } else {
        parentUser.linked_patient_id = patientId;
        if (body.parent_name) parentUser.name = body.parent_name;
        if (body.parent_phone) parentUser.phone = body.parent_phone;
        db.saveUser(parentUser);
      }
      newPatient.parent_user_id = parentUser.id;
    }

    const saved = db.savePatient(newPatient);
    res.json({ success: true, data: saved });
  });

  router.delete('/patients/:id', (req: Request, res: Response) => {
    const success = db.deletePatient(String(req.params.id));
    res.json({ success });
  });

  // Thresholds Config
  router.get('/thresholds/:patientId', (req: Request, res: Response) => {
    const threshold = db.getThreshold(String(req.params.patientId));
    res.json({ success: true, data: threshold });
  });

  router.post('/thresholds', (req: Request, res: Response) => {
    const body = req.body;
    const threshold: ThresholdConfig = {
      id: body.id || `thresh-${Date.now()}`,
      patient_id: body.patient_id || 'default',
      gsr_warning_us: Number(body.gsr_warning_us) || 6.0,
      gsr_critical_us: Number(body.gsr_critical_us) || 7.5,
      bpm_min: Number(body.bpm_min) || 60,
      bpm_max: Number(body.bpm_max) || 110,
      imu_fidget_threshold: Number(body.imu_fidget_threshold) || 65,
      haptic_intensity_pct: Number(body.haptic_intensity_pct) || 80,
      haptic_duration_ms: Number(body.haptic_duration_ms) || 1500,
      haptic_cooldown_sec: Number(body.haptic_cooldown_sec) || 5,
      auto_intervention_enabled: body.auto_intervention_enabled !== false
    };

    const saved = db.saveThreshold(threshold);

    // Broadcast update via MQTT to ESP32 hardware
    mqttBroker.publishCommand('esp32-c3-band-001', {
      cmd: 'SET_THRESHOLDS',
      thresholds: saved
    });

    // Notify WebSocket clients
    wsServer.broadcast({
      type: 'THRESHOLDS_UPDATED',
      data: saved
    });

    res.json({ success: true, data: saved });
  });

  // Sessions
  router.get('/sessions', (req: Request, res: Response) => {
    const patientId = req.query.patient_id as string | undefined;
    res.json({
      success: true,
      data: db.getSessions(patientId)
    });
  });

  router.post('/sessions/start', (req: Request, res: Response) => {
    const { patient_id, title, notes } = req.body;
    const session: MonitoringSession = {
      id: `sess-${Date.now()}`,
      patient_id: patient_id || 'default',
      title: title || 'Sesi Monitoring Real-Time',
      start_time: new Date().toISOString(),
      end_time: null,
      duration_seconds: 0,
      status: 'ACTIVE',
      avg_gsr: 0,
      peak_gsr: 0,
      avg_bpm: 0,
      peak_bpm: 0,
      alert_count: 0,
      notes: notes || ''
    };
    const saved = db.saveSession(session);
    telemetryManager.setActiveSession(saved.id);
    res.json({ success: true, data: saved });
  });

  router.post('/sessions/stop', (req: Request, res: Response) => {
    const { session_id } = req.body;
    let target = session_id ? db.getSessionById(session_id) : null;
    
    // Fallback to latest active session if not found
    if (!target) {
      const activeList = db.getSessions().filter(s => s.status === 'ACTIVE');
      if (activeList.length > 0) target = activeList[0];
    }

    if (target) {
      target.end_time = new Date().toISOString();
      target.status = 'COMPLETED';
      const duration = Math.round((new Date(target.end_time).getTime() - new Date(target.start_time).getTime()) / 1000);
      target.duration_seconds = Math.max(1, duration);
      db.saveSession(target);
    }

    // Complete all other active sessions as well
    const allActive = db.getSessions().filter(s => s.status === 'ACTIVE');
    allActive.forEach(s => {
      s.end_time = new Date().toISOString();
      s.status = 'COMPLETED';
      const duration = Math.round((new Date(s.end_time).getTime() - new Date(s.start_time).getTime()) / 1000);
      s.duration_seconds = Math.max(1, duration);
      db.saveSession(s);
    });

    telemetryManager.setActiveSession(null);
    wsServer.broadcast({
      type: 'SESSION_STOPPED',
      session: target
    });

    res.json({ success: true, message: 'Sesi berhasil dihentikan', data: target });
  });

  router.delete('/sessions/:id', (req: Request, res: Response) => {
    const success = db.deleteSession(String(req.params.id));
    if (success) {
      wsServer.broadcast({
        type: 'SESSION_DELETED',
        session_id: String(req.params.id)
      });
      res.json({ success: true, message: 'Sesi berhasil dihapus' });
    } else {
      res.status(404).json({ success: false, message: 'Sesi tidak ditemukan' });
    }
  });

  router.delete('/sessions', (req: Request, res: Response) => {
    const patientId = req.query.patient_id as string | undefined;
    const success = db.clearAllSessions(patientId);
    wsServer.broadcast({
      type: 'ALL_SESSIONS_CLEARED',
      patient_id: patientId
    });
    res.json({ success: true, message: 'Semua riwayat sesi berhasil dibersihkan' });
  });

  // Alerts Log & Manual Trigger
  router.get('/alerts', (req: Request, res: Response) => {
    const patientId = req.query.patient_id as string | undefined;
    res.json({
      success: true,
      data: db.getAlerts(patientId)
    });
  });

  router.delete('/alerts/:id', (req: Request, res: Response) => {
    const success = db.deleteAlert(String(req.params.id));
    res.json({ success });
  });

  router.delete('/alerts', (req: Request, res: Response) => {
    const patientId = req.query.patient_id as string | undefined;
    const success = db.clearAllAlerts(patientId);
    res.json({ success });
  });

  router.post('/alerts/trigger', (req: Request, res: Response) => {
    const duration = Number(req.body.duration_ms) || 1500;
    const reason = req.body.reason || 'MANUAL_TRIGGER';
    telemetryManager.triggerHaptic(duration, reason);
    mqttBroker.publishCommand('esp32-c3-band-001', {
      cmd: 'TRIGGER_HAPTIC',
      duration_ms: duration,
      reason
    });
    res.json({ success: true, message: 'Haptic trigger sent to hardware' });
  });

  // Comprehensive Hardware Diagnostic & Actuator Testing
  router.post('/hardware/test', (req: Request, res: Response) => {
    const { test_type, duration_ms } = req.body;
    const duration = Number(duration_ms) || (test_type === 'HAPTIC_SHORT' ? 500 : (test_type === 'HAPTIC_STRONG' ? 2500 : 1500));
    
    console.log(`⚡ [Hardware Test] Executing: ${test_type} (${duration}ms)`);
    telemetryManager.triggerHaptic(duration, `TEST_${test_type}`);

    // Publish to both local & public cloud MQTT brokers
    mqttBroker.publishCommand('esp32-c3-band-001', {
      cmd: 'TRIGGER_HAPTIC',
      test_type: test_type || 'MANUAL_TEST',
      duration_ms: duration,
      timestamp: Date.now()
    });

    res.json({
      success: true,
      message: `Perintah uji perangkat keras [${test_type}] berhasil dikirim ke ESP32!`,
      details: { test_type, duration_ms: duration }
    });
  });

  // Clinical Notes
  router.get('/notes', (req: Request, res: Response) => {
    const patientId = req.query.patient_id as string | undefined;
    res.json({
      success: true,
      data: db.getNotes(patientId)
    });
  });

  router.post('/notes', (req: Request, res: Response) => {
    const body = req.body;
    const newNote: ClinicalNote = {
      id: `note-${Date.now()}`,
      session_id: body.session_id || null,
      patient_id: body.patient_id || 'default',
      author: body.author || 'Muhammad Reza (Peneliti)',
      timestamp: new Date().toISOString(),
      category: body.category || 'OBSERVATION',
      content: body.content || ''
    };
    const saved = db.addNote(newNote);
    res.json({ success: true, data: saved });
  });

  // Export CSV
  router.get('/export/csv', (req: Request, res: Response) => {
    const sessions = db.getSessions();
    const headers = 'ID,Patient ID,Title,Start Time,End Time,Duration (s),Status,Avg GSR (uS),Peak GSR (uS),Avg BPM,Peak BPM,Alerts,Notes\n';
    const rows = sessions.map(s => 
      `"${s.id}","${s.patient_id}","${s.title}","${s.start_time}","${s.end_time || ''}",${s.duration_seconds},"${s.status}",${s.avg_gsr},${s.peak_gsr},${s.avg_bpm},${s.peak_bpm},${s.alert_count},"${(s.notes || '').replace(/"/g, '""')}"`
    ).join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="adhd_monitoring_sessions.csv"');
    res.send(headers + rows);
  });

  // ============================================================
  //  ENGINE API — BiofeedbackDecisionEngine endpoints
  // ============================================================

  /** GET /api/engine/state/:patientId — Snapshot analisis terkini */
  router.get('/engine/state/:patientId', (req: Request, res: Response) => {
    const snapshot = decisionEngine.getLatestSnapshot(String(req.params.patientId));
    if (!snapshot) {
      return res.json({
        success: true,
        data: null,
        message: 'Belum ada data telemetry yang diproses untuk pasien ini. Tunggu ESP32 mengirim data atau aktifkan simulasi.'
      });
    }
    res.json({ success: true, data: snapshot });
  });

  /** GET /api/engine/log/:patientId — Log 50 keputusan terakhir */
  router.get('/engine/log/:patientId', (req: Request, res: Response) => {
    const log = decisionEngine.getDecisionLog(String(req.params.patientId));
    res.json({ success: true, data: log, count: log.length });
  });

  /** GET /api/engine/baseline/:patientId — Baseline adaptif anak */
  router.get('/engine/baseline/:patientId', (req: Request, res: Response) => {
    const baseline = decisionEngine.getBaseline(String(req.params.patientId));
    res.json({ success: true, data: baseline });
  });

  /** POST /api/engine/reset/:patientId — Reset baseline & state engine */
  router.post('/engine/reset/:patientId', (req: Request, res: Response) => {
    decisionEngine.resetPatient(String(req.params.patientId));
    res.json({ success: true, message: `Engine state untuk pasien ${req.params.patientId} berhasil direset.` });
  });

  /** GET /api/engine/docs — Dokumentasi lengkap engine */
  router.get('/engine/docs', (req: Request, res: Response) => {
    res.json({ success: true, data: decisionEngine.getDocumentation() });
  });

  return router;
}
