/**
 * Service wiring. Everything the UI uses comes from here.
 *
 * The mock implementations run entirely in the browser against an in-memory store
 * (persisted to localStorage). To move to a real backend, implement the interfaces in
 * `./types` over HTTP (FastAPI) and return them from `createServices`.
 * See docs/API_ADAPTER.md.
 */
import { getStore, type Store } from '@/data/store';
import type { Actor } from '@/domain/types';
import type { Ctx } from './core';
import { createAlertRepository } from './mock/alerts';
import { createAssistantService } from './mock/assistant';
import { createBatteryRepository } from './mock/batteries';
import { createDeploymentRepository } from './mock/deployments';
import { createImportService } from './mock/imports';
import { createInsightsRepository } from './mock/insights';
import { createAdminRepository, createOverviewRepository, createPredictionRepository } from './mock/misc';
import { createReportRepository } from './mock/reports';
import { createRestorationRepository } from './mock/restoration';
import { createTelemetryRepository } from './mock/telemetry';
import { createTestRepository } from './mock/tests';
import { DATA_SOURCE } from '@/lib/runtime';
import { createHttpServices } from './http';
import { getSessionUserId } from './session';
import type { Services } from './types';

export function actorFromUser(store: Store, userId: string | null): Actor {
  const u = store.db.users.find((x) => x.id === userId && x.active) ?? store.db.users.find((x) => x.role === 'battery_engineer')!;
  return { userId: u.id, name: u.name, role: u.role, tenantId: u.tenantId, siteScope: u.siteScope };
}

export function createServices(store: Store, getActor: () => Actor): Services {
  const ctx: Ctx = { store, actor: getActor };
  return {
    insights: createInsightsRepository(ctx),
    batteries: createBatteryRepository(ctx),
    imports: createImportService(ctx),
    tests: createTestRepository(ctx),
    restoration: createRestorationRepository(ctx),
    deployments: createDeploymentRepository(ctx),
    telemetry: createTelemetryRepository(ctx),
    alerts: createAlertRepository(ctx),
    predictions: createPredictionRepository(ctx),
    reports: createReportRepository(ctx),
    assistant: createAssistantService(ctx),
    admin: createAdminRepository(ctx),
    overview: createOverviewRepository(ctx),
    actor: getActor,
  };
}

let appServices: Services | null = null;

/**
 * The singleton used by the app. In mock mode the acting user comes from the demo session; in
 * HTTP mode (NEXT_PUBLIC_DATA_SOURCE=http) every call goes to the API, which resolves the user from the token.
 */
export function getServices(): Services {
  if (!appServices) {
    if (DATA_SOURCE === 'http') {
      appServices = createHttpServices();
    } else {
      const store = getStore();
      appServices = createServices(store, () => actorFromUser(store, getSessionUserId()));
    }
  }
  return appServices;
}
