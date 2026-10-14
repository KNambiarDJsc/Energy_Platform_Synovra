/**
 * HTTP implementation of the service interfaces in ../types.ts, talking to the Synovra API (server/).
 * Method for method it mirrors the mock implementations, so pages do not know which one they use.
 *
 * Areas the server does not provide yet (monitoring, alerts and tasks, assistant) answer locally
 * with an explicit "not connected" result instead of calling the API. Navigation hides those areas
 * in HTTP mode; these answers only cover places that embed them (for example passport tabs).
 */
import { SAMPLE_CSV } from '@/domain/csv';
import { ConflictError, NotFoundError } from '@/domain/permissions';
import type { Actor } from '@/domain/types';
import type {
  AlertRepository, AssistantService, BatteryRepository, DeploymentRepository, ImportService, PredictionRepository,
  ReportRepository, RestorationRepository, Services, TelemetryRepository, TelemetrySummary, TestRepository,
  AdminRepository, OverviewRepository,
} from '../types';
import { api, qs } from './client';
import { currentActor } from './session';

const NOT_CONNECTED = 'Monitoring is not connected in this deployment. Telemetry is unknown, not normal.';

const enc = encodeURIComponent;

function batteries(): BatteryRepository {
  return {
    list: (f = {}) => api.get(`/batteries${qs({ ...f })}`),
    facets: () => api.get('/batteries/facets'),
    get: (id) => api.get(`/batteries/${enc(id)}/passport`),
    lookupByPublicRef: (ref) => api.get(`/lookup${qs({ ref })}`),
    create: (input) => api.post('/batteries', input),
    correct: (input) => api.post(`/batteries/${enc(input.batteryId)}/corrections`, input),
    reissueLabel: (id, reason) => api.post(`/batteries/${enc(id)}/reissue-label`, { reason }),
    exportCsv: (ids) => api.get(`/batteries/export${qs({ ids: ids?.join(',') })}`),
    families: () => api.get('/battery-families'),
  };
}

function imports(): ImportService {
  return {
    templates: () => api.get('/import-templates'),
    preview: (args) => api.post('/imports', args),
    commit: (jobId) => api.post(`/imports/${enc(jobId)}/commit`),
    list: () => api.get('/imports'),
    sampleCsv: () => SAMPLE_CSV,
  };
}

function tests(): TestRepository {
  return {
    list: (f = {}) => api.get(`/tests${qs({ ...f })}`),
    get: (id) => api.get(`/tests/${enc(id)}`),
    protocols: () => api.get('/test-protocols'),
    create: (input) => api.post('/tests', input),
    submit: (id) => api.post(`/tests/${enc(id)}/submit`),
    startReview: (id) => api.post(`/tests/${enc(id)}/start-review`),
    approve: (id, reason) => api.post(`/tests/${enc(id)}/approve`, { reason }),
    reject: (id, reason) => api.post(`/tests/${enc(id)}/reject`, { reason }),
    requestRework: (id, reason) => api.post(`/tests/${enc(id)}/rework`, { reason }),
    attachEvidence: (id, fileName, sizeKb) => api.post(`/tests/${enc(id)}/evidence`, { fileName, sizeKb }),
  };
}

function restoration(): RestorationRepository {
  return {
    batches: () => api.get('/restoration/batches'),
    batchResults: (id) => api.get(`/restoration/batches/${enc(id)}/results`),
    economics: (id, scenario) => api.post(`/restoration/batches/${enc(id)}/economics`, scenario),
    attempts: (f = {}) => api.get(`/restoration/attempts${qs({ ...f })}`),
    markCandidate: (batteryId, reason) => api.post(`/batteries/${enc(batteryId)}/restoration-candidate`, { reason }),
    createAttempt: (args) => api.post('/restoration/attempts', args),
    addNote: (id, text) => api.post(`/restoration/attempts/${enc(id)}/notes`, { text }),
    addEvidence: (id, fileName, sizeKb) => api.post(`/restoration/attempts/${enc(id)}/evidence`, { fileName, sizeKb }),
    submitForReview: (id, afterTestId) => api.post(`/restoration/attempts/${enc(id)}/submit`, { afterTestId }),
    decide: (id, decision, reason) => api.post(`/restoration/attempts/${enc(id)}/decide`, { decision, reason }),
  };
}

function deployments(): DeploymentRepository {
  return {
    inventory: () => api.get('/inventory'),
    sites: () => api.get('/sites'),
    validate: (batteryId, slotId) => api.post('/assignments/validate', { batteryId, slotId }),
    move: (input) => api.post('/assignments', input),
    reserve: (batteryId, reason) => api.post(`/batteries/${enc(batteryId)}/reserve`, { reason }),
    returnFromSite: (batteryId, reason) => api.post(`/batteries/${enc(batteryId)}/return`, { reason }),
    deployable: () => api.get('/inventory/deployable'),
  };
}

function telemetry(): TelemetryRepository {
  const none: TelemetrySummary = {
    available: false, reason: NOT_CONNECTED, sensorSerial: null, lastReadingAt: null, freshness: 'none', voltageV: null,
    temperatureC: null, resistanceMOhm: null, resistanceSource: null, completenessPct: null, mappingQuality: null, hoursAbove30C: null,
  };
  return {
    gateways: async () => [],
    sensors: async () => [],
    series: async () => ({ points: [], bucketHours: 1, sensorSerial: null, note: NOT_CONNECTED }),
    stringPeers: async () => ({ points: [] }),
    summary: async () => none,
    fleet: async () => ({ monitoredBatteries: 0, deployed: 0, unmonitored: 0, completenessPct: null, staleGateways: 0 }),
    snapshotAt: () => new Date().toISOString(),
  };
}

function alerts(): AlertRepository {
  const off = async (): Promise<never> => { throw new ConflictError('Alerts and service tasks are not enabled on this deployment.'); };
  return {
    list: async () => [],
    get: async () => { throw new NotFoundError('Alert'); },
    acknowledge: off, assign: off, start: off, resolve: off, close: off,
    tasks: async () => [],
    createTask: off, confirmDraft: off, updateTask: off,
    assignees: async () => [],
  };
}

function predictions(): PredictionRepository {
  return {
    list: (f = {}) => api.get(`/predictions${qs({ ...f })}`),
    review: (id, outcome) => api.post(`/predictions/${enc(id)}/review`, { outcome }),
  };
}

function reports(): ReportRepository {
  return {
    templates: () => api.get('/report-templates'),
    list: () => api.get('/reports'),
    get: (id) => api.get(`/reports/${enc(id)}`),
    generate: (input) => api.post('/reports', input),
    approve: (id) => api.post(`/reports/${enc(id)}/approve`),
    exportCsv: (id) => api.get(`/reports/${enc(id)}/export`),
    scopes: (templateId) => api.get(`/report-scopes${qs({ templateId })}`),
  };
}

function assistant(): AssistantService {
  return {
    suggestions: () => [],
    ask: async (prompt) => ({
      id: `local_${Date.now()}`, prompt, answer: '', citations: [], uncertainty: '', refused: true,
      refusalReason: 'The assistant is not enabled on this deployment.', draft: null, scopeNote: '',
    }),
    confirmDraft: async () => { throw new ConflictError('The assistant is not enabled on this deployment.'); },
  };
}

function admin(): AdminRepository {
  return {
    users: () => api.get('/admin/users'),
    tenants: () => api.get('/admin/tenants'),
    sites: () => api.get('/admin/sites'),
    families: () => api.get('/admin/families'),
    protocols: () => api.get('/admin/protocols'),
    sensorMappings: () => api.get('/admin/sensor-mappings'),
    importTemplates: () => api.get('/admin/import-templates'),
    notifications: () => api.get('/admin/notifications'),
    setNotification: (id, enabled) => api.patch(`/admin/notifications/${enc(id)}`, { enabled }),
    setUserActive: (id, active) => api.patch(`/admin/users/${enc(id)}`, { active }),
    audit: (f = {}) => api.get(`/audit-events${qs({ ...f })}`),
    resetDemo: async () => { await api.post('/admin/reset-demo'); },
  };
}

function overview(): OverviewRepository {
  return { get: () => api.get('/overview') };
}

export function createHttpServices(): Services {
  return {
    batteries: batteries(), imports: imports(), tests: tests(), restoration: restoration(), deployments: deployments(),
    telemetry: telemetry(), alerts: alerts(), predictions: predictions(), reports: reports(), assistant: assistant(),
    admin: admin(), overview: overview(),
    actor: (): Actor => {
      const a = currentActor();
      if (!a) throw new Error('Not signed in.');
      return a;
    },
  };
}
