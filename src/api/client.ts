/**
 * Central API Client for VIGOR Smart Port Operations
 * Connects frontend to FastAPI (http://localhost:8000/api/v1) + PostgreSQL
 * Supports Dual Mode: Real API Mode (USE_MOCK_API=false) & Demo Mode (USE_MOCK_API=true)
 */

import {
  Vessel,
  Berth,
  Voyage,
  FuelOperation,
  PaymentAccount,
  PaymentTransaction,
  ManufacturerQueueEntry,
  OperationalReading,
  DelayEvent,
  Alert,
  SystemSettings,
  WhatIfScenario,
  VesselActivity,
  ActivityStatus,
  ActivityExecutionMode,
  ActivityConflictResolution,
} from '../types';
import { getInitialDemoData } from '../mock/mockData';
import { recalculateVoyageDependencies, calculateUnloadingForecast } from '../lib/scheduleEngine';
import { generateSystemAlerts } from '../lib/alerts';
import { calculatePaymentAccountTotals } from '../lib/paymentEngine';
import {
  BackendActiveDashboard,
  adaptBackendVessel,
  adaptBackendBerth,
  adaptBackendReading,
  adaptBackendDelay,
} from './adapters';

export const API_BASE_URL = (
  ((import.meta as unknown as { env: Record<string, string> }).env?.VITE_API_URL as string | undefined) ||
  '/api/v1'
).replace(/\/+$/, '');

export const USE_MOCK_API =
  ((import.meta as unknown as { env: Record<string, string> }).env?.VITE_USE_MOCK_API ?? 'false') === 'true';

export class ApiError extends Error {
  public status: number;
  public detail: unknown;
  public isCorsOrNetworkError: boolean;

  constructor(
    message: string,
    status = 500,
    detail: unknown = null,
    isCorsOrNetworkError = false
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.detail = detail;
    this.isCorsOrNetworkError = isCorsOrNetworkError;
  }
}

/**
 * Universal fetch wrapper for all FastAPI endpoints.
 * Prepends API_BASE_URL, sets JSON headers, handles 204s, CORS failures, and FastAPI error structures.
 */
export async function apiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const url = `${API_BASE_URL}${normalizedPath}`;

  const headers = new Headers(options.headers || {});
  if (!headers.has('Content-Type') && options.body && typeof options.body === 'string') {
    headers.set('Content-Type', 'application/json');
  }
  if (!headers.has('Accept')) {
    headers.set('Accept', 'application/json');
  }

  // Automatically attach auth token if available
  try {
    const token = localStorage.getItem('vigor_auth_token') || sessionStorage.getItem('vigor_auth_token');
    if (token && !headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${token}`);
    }
  } catch {}

  let response: Response;
  try {
    response = await fetch(url, {
      ...options,
      headers,
    });
  } catch (err: unknown) {
    const message = (err as Error)?.message || 'Network request failed';
    const isCorsOrOffline =
      message.includes('Failed to fetch') ||
      message.includes('NetworkError') ||
      message.includes('Load failed') ||
      err instanceof TypeError;

    throw new ApiError(
      isCorsOrOffline
        ? 'Backend connection unavailable. Check API URL/CORS configuration.'
        : `Network Error: ${message}`,
      0,
      err,
      isCorsOrOffline
    );
  }

  // Handle 204 No Content
  if (response.status === 204) {
    return {} as T;
  }

  // Parse response body
  let responseData: unknown = null;
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    try {
      responseData = await response.json();
    } catch {
      responseData = null;
    }
  } else {
    try {
      responseData = await response.text();
    } catch {
      responseData = null;
    }
  }

  if (!response.ok) {
    let errorMsg = `API request failed with status ${response.status}`;

    if (responseData && typeof responseData === 'object' && 'detail' in responseData) {
      const detail = (responseData as { detail: unknown }).detail;
      if (typeof detail === 'string') {
        errorMsg = detail;
      } else if (Array.isArray(detail)) {
        // FastAPI Pydantic validation error format: [{ loc: [...], msg: "...", type: "..." }]
        errorMsg = detail
          .map((item: any) =>
            item.msg ? `${item.loc?.join('.') || 'field'}: ${item.msg}` : JSON.stringify(item)
          )
          .join('; ');
      } else {
        errorMsg = JSON.stringify(detail);
      }
    } else if (responseData && typeof responseData === 'object' && 'error' in responseData) {
      const backendError = (responseData as { error?: { message?: unknown } }).error;
      if (typeof backendError === 'string') { errorMsg = backendError; }
      else if (typeof backendError?.message === 'string') {
        errorMsg = backendError.message;
      } else if (backendError?.message) {
        errorMsg = JSON.stringify(backendError.message);
      }
    }

    throw new ApiError(errorMsg, response.status, responseData);
  }

  return responseData as T;
}

const STORAGE_KEY = 'vigor_smart_port_ops_v2';

export interface ConnectionInfo {
  connectionStatus: 'LIVE API' | 'DATABASE CONNECTED' | 'API OFFLINE' | 'DEMO MODE';
  apiHealth: 'healthy' | 'unhealthy' | 'offline' | 'checking';
  databaseStatus: 'connected' | 'unavailable' | 'offline' | 'checking';
  lastChecked: string | null;
  errorMessage: string | null;
  isCorsError: boolean;
  serviceName: string;
  backendActiveDashboard: BackendActiveDashboard | null;
}

export interface AppStore {
  vessels: Vessel[];
  berths: Berth[];
  voyages: Voyage[];
  fuelOperations: FuelOperation[];
  paymentAccounts: PaymentAccount[];
  paymentTransactions: PaymentTransaction[];
  manufacturerQueue: ManufacturerQueueEntry[];
  operationalReadings: OperationalReading[];
  delayEvents: DelayEvent[];
  systemSettings: SystemSettings;
  activities: VesselActivity[];
  activeScenario?: WhatIfScenario;
  connectionInfo: ConnectionInfo;
}

export type PersistedOperationalState = Pick<
  AppStore,
  | 'vessels'
  | 'berths'
  | 'voyages'
  | 'fuelOperations'
  | 'paymentAccounts'
  | 'paymentTransactions'
  | 'manufacturerQueue'
  | 'operationalReadings'
  | 'delayEvents'
  | 'systemSettings'
  | 'activities'
>;

export interface BackendOperationalStateEnvelope {
  state: Partial<PersistedOperationalState> | null;
  revision: number;
  updated_at: string | null;
}

type Listener = () => void;

class ApiClient {
  private store: AppStore;
  private listeners: Set<Listener> = new Set();
  private healthIntervalId: number | null = null;
  private stateSyncTimerId: number | null = null;
  private stateRevision = 0;
  private stateLoaded = false;
  private stateDirty = false;
  private stateBlocked = false;
  private stateSyncInFlight = false;
  private stateSyncPending = false;
  private readInFlight = false;
  private localChangeVersion = 0;

  constructor() {
    this.store = this.loadFromStorage();
    this.recalculateAll();

    // Initialize backend connection testing & polling
    if (!USE_MOCK_API) {
      this.testConnection();
      // Poll health every 30 seconds
      if (typeof window !== 'undefined') {
        this.healthIntervalId = window.setInterval(() => {
          this.testConnection(false);
        }, 30000);
        window.setInterval(() => {
          if(document.visibilityState === 'visible') void this.refreshLiveData();
        }, 2000);
        window.addEventListener('focus', () => void this.refreshLiveData());
        window.addEventListener('online', () => void this.testConnection(false));
        document.addEventListener('visibilitychange', () => {
          if(document.visibilityState === 'visible') void this.refreshLiveData();
        });
      }
    }
  }

  private loadFromStorage(): AppStore {
    const defaultConnection: ConnectionInfo = {
      connectionStatus: USE_MOCK_API ? 'DEMO MODE' : 'API OFFLINE',
      apiHealth: 'checking',
      databaseStatus: 'checking',
      lastChecked: null,
      errorMessage: null,
      isCorsError: false,
      serviceName: 'port-monitoring-api',
      backendActiveDashboard: null,
    };

    if (!USE_MOCK_API) return {
      vessels: [], berths: [], voyages: [], fuelOperations: [], paymentAccounts: [], paymentTransactions: [],
      manufacturerQueue: [], operationalReadings: [], delayEvents: [], activities: [],
      systemSettings: {postUnloadBerthBufferHours:1.5,arrivalOverdueGraceMinutes:30,paymentWarningThresholdHours:48,manufacturerEligibilityPercent:100,defaultSailingSpeedKnots:10,defaultLoadingRateTph:500,defaultUnloadingRateTph:600,unloadingRateUnitPreference:'TPH'},
      connectionInfo: defaultConnection,
    };
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.vessels && parsed.voyages && parsed.berths) {
          const baseline = getInitialDemoData();
          return {
            ...baseline,
            ...parsed,
            activities: parsed.activities && parsed.activities.length > 0 ? parsed.activities : baseline.activities,
            connectionInfo: {
              ...defaultConnection,
              ...(parsed.connectionInfo || {}),
            },
          };
        }
      }
    } catch {
      // Fallback
    }

    const baseline = getInitialDemoData();
    return {
      ...baseline,
      connectionInfo: defaultConnection,
    };
  }

  private saveToStorage(syncBackend = true): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.store));
    } catch {
      // Quota exceeded
    }
    this.notify();
    if (syncBackend) {
      this.localChangeVersion++;
      this.stateDirty = true;
      this.queueBackendStateSync();
    }
  }

  private getPersistedOperationalState(): PersistedOperationalState {
    const {
      vessels,
      berths,
      voyages,
      fuelOperations,
      paymentAccounts,
      paymentTransactions,
      manufacturerQueue,
      operationalReadings,
      delayEvents,
      systemSettings,
      activities,
    } = this.store;
    return {
      vessels,
      berths,
      voyages,
      fuelOperations,
      paymentAccounts,
      paymentTransactions,
      manufacturerQueue,
      operationalReadings,
      delayEvents,
      systemSettings,
      activities,
    };
  }

  private queueBackendStateSync(): void {
    if (
      USE_MOCK_API || !this.stateLoaded || this.stateBlocked ||
      this.store.connectionInfo.apiHealth !== 'healthy' ||
      typeof window === 'undefined'
    ) {
      return;
    }
    if (this.stateSyncTimerId !== null) {
      window.clearTimeout(this.stateSyncTimerId);
    }
    this.stateSyncTimerId = window.setTimeout(() => {
      this.stateSyncTimerId = null;
      void this.persistOperationalState();
    }, 500);
  }

  private async persistOperationalState(): Promise<void> {
    if (this.stateSyncInFlight) {
      this.stateSyncPending = true;
      return;
    }
    if (!this.stateLoaded || !this.stateDirty || this.stateBlocked) return;
    this.stateSyncInFlight = true;
    this.stateDirty = false;
    try {
      const response = await apiFetch<BackendOperationalStateEnvelope>('/operations/state', {
        method: 'PUT',
        body: JSON.stringify({
          state: this.getPersistedOperationalState(),
          expected_revision: this.stateRevision,
        }),
      });
      this.stateRevision = response.revision;
      this.store.connectionInfo.errorMessage = null;
      this.notify();
    } catch (error) {
      this.stateDirty = true;
      if (error instanceof ApiError && error.status === 409) {
        this.stateBlocked = true;
        this.store.connectionInfo.errorMessage =
          'A newer operations update exists on the server. Refresh before editing again.';
        this.notify();
      } else {
        this.store.connectionInfo.errorMessage =
          'The API is online, but the latest operations update could not be saved.';
        this.notify();
      }
    } finally {
      this.stateSyncInFlight = false;
      if (this.stateSyncPending) {
        this.stateSyncPending = false;
        this.queueBackendStateSync();
      }
    }
  }

  public subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    this.listeners.forEach((l) => l());
  }

  public resetDemoData(): void {
    if (!USE_MOCK_API) throw new Error('Demo reset is disabled for database mode.');
    const baseline = getInitialDemoData();
    this.store = {
      ...baseline,
      connectionInfo: {
        ...this.store.connectionInfo,
      },
    };
    this.recalculateAll();
    this.saveToStorage();
  }

  public exportState(): Record<string, unknown> {
    return {
      ...this.store,
      exportedAt: new Date().toISOString(),
      apiBaseUrl: API_BASE_URL,
      useMockApi: USE_MOCK_API,
    };
  }

  public recalculateAll(): void {
    // 1. Update all payment accounts based on transactions
    this.store.paymentAccounts = this.store.paymentAccounts.map((acc) => {
      const totals = calculatePaymentAccountTotals(acc, this.store.paymentTransactions);
      return {
        ...acc,
        isEligible: totals.isEligible,
        status: totals.remaining === 0 ? 'PAID' : totals.totalPaid > 0 ? 'PARTIALLY_PAID' : 'PENDING',
        eligibleAt: totals.isEligible ? acc.eligibleAt || new Date().toISOString() : undefined,
        updatedAt: new Date().toISOString(),
      };
    });

    // 2. Find primary berth B01 expected release time from vessel berthed there
    // 3. Recalculate each voyage's downstream dependencies and berth conflict
    this.store.voyages = this.store.voyages.map((voyage) => {
      const fuelOp = this.store.fuelOperations.find((f) => f.voyageId === voyage.id);
      const mfrPmt = this.store.paymentAccounts.find(
        (p) => p.voyageId === voyage.id && p.category === 'MANUFACTURER'
      );
      const fuelPmt = this.store.paymentAccounts.find(
        (p) => p.voyageId === voyage.id && p.category === 'FUEL'
      );
      const activeDelays = this.store.delayEvents.filter((d) => d.voyageId === voyage.id && !d.resolved);

      return recalculateVoyageDependencies(
        voyage,
        fuelOp,
        mfrPmt,
        fuelPmt,
        activeDelays,
        this.store.voyages.find(other => other.id !== voyage.id && other.assignedBerthId === voyage.assignedBerthId && other.status === 'ACTIVE' && ['UNLOADING','BERTHED_AT_VIGOR'].includes(other.currentStage))?.expectedBerthRelease,
        this.store.systemSettings
      );
    });

    // 4. Update manufacturer queue eligibility based on payment accounts
    this.store.manufacturerQueue = this.store.manufacturerQueue.map((entry) => {
      if (entry.voyageId) {
        const pmt = this.store.paymentAccounts.find(
          (p) => p.voyageId === entry.voyageId && p.category === 'MANUFACTURER'
        );
        if (pmt) {
          return {
            ...entry,
            isEligible: pmt.isEligible,
            paymentStatus: pmt.isEligible ? 'PAID' : pmt.status === 'PARTIALLY_PAID' ? 'PARTIAL' : 'PENDING',
          };
        }
      }
      return entry;
    });
  }

  // -------------------------------------------------------------------------
  // Backend Connectivity & Synchronization
  // -------------------------------------------------------------------------

  public async testConnection(showLoading = true): Promise<ConnectionInfo> {
    if (USE_MOCK_API) {
      this.store.connectionInfo = {
        connectionStatus: 'DEMO MODE',
        apiHealth: 'healthy',
        databaseStatus: 'connected',
        lastChecked: new Date().toISOString(),
        errorMessage: null,
        isCorsError: false,
        serviceName: 'mock-storage-engine',
        backendActiveDashboard: null,
      };
      this.notify();
      return this.store.connectionInfo;
    }

    if (showLoading) {
      this.store.connectionInfo = {
        ...this.store.connectionInfo,
        apiHealth: 'checking',
        databaseStatus: 'checking',
      };
      this.notify();
    }

    const now = new Date().toISOString();
    let apiHealthResp: any = null;
    let dbHealthResp: any = null;
    let errorMsg: string | null = null;
    let isCors = false;

    try {
      apiHealthResp = await apiFetch<any>('/health', { method: 'GET' });
    } catch (err: any) {
      errorMsg = err.message || 'API unreachable';
      isCors = Boolean(err.isCorsOrNetworkError);
    }

    if (apiHealthResp) {
      try {
        dbHealthResp = await apiFetch<any>('/health/database', { method: 'GET' });
      } catch (err: any) {
        errorMsg = `Database check failed: ${err.message}`;
      }
    }

    const isApiHealthy = apiHealthResp?.status === 'healthy';
    const isDbConnected = dbHealthResp?.database === 'connected';

    let overallStatus: ConnectionInfo['connectionStatus'] = 'API OFFLINE';
    if (isDbConnected) {
      overallStatus = 'DATABASE CONNECTED';
    } else if (isApiHealthy) {
      overallStatus = 'LIVE API';
    }

    this.store.connectionInfo = {
      connectionStatus: overallStatus,
      apiHealth: isApiHealthy ? 'healthy' : errorMsg ? 'offline' : 'unhealthy',
      databaseStatus: isDbConnected ? 'connected' : 'unavailable',
      lastChecked: now,
      errorMessage: this.stateDirty || this.stateBlocked ? this.store.connectionInfo.errorMessage : isDbConnected ? null : errorMsg,
      isCorsError: isCors,
      serviceName: apiHealthResp?.service || 'port-monitoring-api',
      backendActiveDashboard: this.store.connectionInfo.backendActiveDashboard,
    };

    if (isApiHealthy) {
      if (this.stateDirty && !this.stateBlocked) await this.persistOperationalState();
      await this.syncFromBackend();
    }

    this.saveToStorage(false);
    return this.store.connectionInfo;
  }

  public async refreshLiveData(): Promise<void> {
    if(USE_MOCK_API || !(localStorage.getItem('vigor_auth_token') || sessionStorage.getItem('vigor_auth_token'))) return;
    if(this.stateDirty && !this.stateBlocked) await this.persistOperationalState();
    await this.syncFromBackend();
  }

  public async syncFromBackend(): Promise<void> {
    if (this.readInFlight || this.stateSyncInFlight || this.stateDirty || this.stateBlocked) return;
    this.readInFlight = true;
    const version = this.localChangeVersion;
    try {
      const remote = await apiFetch<BackendOperationalStateEnvelope>('/operations/state', {cache:'no-store'});
      // A read started before an edit must never overwrite that edit or a newer command.
      if (!remote.state || version !== this.localChangeVersion || this.stateDirty || this.stateSyncInFlight || remote.revision < this.stateRevision) return;
      for (const key of ['vessels','berths','voyages','fuelOperations','paymentAccounts','paymentTransactions','manufacturerQueue','operationalReadings','delayEvents','activities'] as const) {
        if (Array.isArray(remote.state[key])) (this.store[key] as unknown[]) = remote.state[key] as unknown[];
      }
      this.store.systemSettings = {...this.store.systemSettings,...remote.state.systemSettings};
      this.stateRevision = remote.revision;
      this.stateLoaded = true;
      this.store.connectionInfo.errorMessage = null;
      this.store.connectionInfo.lastChecked = new Date().toISOString();
      this.recalculateAll();
      this.saveToStorage(false);
    } catch (error) {
      this.store.connectionInfo.errorMessage = error instanceof ApiError && error.status === 401
        ? 'Your session has expired. Sign out and sign in again to load current data.'
        : 'Live data could not be refreshed. Displayed records may be out of date; reconnecting automatically.';
      this.notify();
    } finally {this.readInFlight = false;}
  }

  private async remoteActivity(path: string, body: unknown): Promise<any> {
    while (this.stateSyncInFlight) await new Promise(resolve => setTimeout(resolve,25));
    await this.persistOperationalState();
    if (this.stateBlocked || this.stateDirty) throw new Error('Save or refresh outstanding changes before changing activities.');
    this.localChangeVersion++;
    const result = await apiFetch<any>(path, {method:'POST', body:JSON.stringify(body)});
    await this.syncFromBackend();
    return result;
  }

  // -------------------------------------------------------------------------
  // Getters
  // -------------------------------------------------------------------------

  public getSnapshot(): AppStore {
    return this.store;
  }

  public getConnectionInfo(): ConnectionInfo {
    return this.store.connectionInfo;
  }

  public getVessels(): Vessel[] {
    return this.store.vessels;
  }

  public getVesselById(id: string): Vessel | undefined {
    return this.store.vessels.find((v) => v.id === id);
  }

  public getBerths(): Berth[] {
    return this.store.berths;
  }

  public getVoyages(): Voyage[] {
    return this.store.voyages;
  }

  public getVoyageById(id: string): Voyage | undefined {
    return this.store.voyages.find((v) => v.id === id);
  }

  public getFuelOperations(): FuelOperation[] {
    return this.store.fuelOperations;
  }

  public getPaymentAccounts(): PaymentAccount[] {
    return this.store.paymentAccounts;
  }

  public getPaymentTransactions(): PaymentTransaction[] {
    return this.store.paymentTransactions;
  }

  public getManufacturerQueue(): ManufacturerQueueEntry[] {
    return this.store.manufacturerQueue;
  }

  public getOperationalReadings(voyageId?: string): OperationalReading[] {
    if (voyageId) {
      return this.store.operationalReadings.filter((r) => r.voyageId === voyageId);
    }
    return this.store.operationalReadings;
  }

  public getDelayEvents(voyageId?: string): DelayEvent[] {
    if (voyageId) {
      return this.store.delayEvents.filter((d) => d.voyageId === voyageId);
    }
    return this.store.delayEvents;
  }

  public getAlerts(): Alert[] {
    const v1Voyage = this.store.voyages.find(
      (v) => v.assignedBerthId === 'B01' && v.currentStage === 'UNLOADING'
    );
    return generateSystemAlerts(
      this.store.voyages,
      this.store.paymentAccounts,
      v1Voyage?.expectedBerthRelease
    ).map(alert=>({...alert,acknowledged:(this.store.systemSettings.acknowledgedAlertIds || []).includes(alert.id)}));
  }

  public getSettings(): SystemSettings {
    return this.store.systemSettings;
  }

  // -------------------------------------------------------------------------
  // Mutations
  // -------------------------------------------------------------------------

  public addVessel(vessel: Omit<Vessel, 'id' | 'createdAt' | 'updatedAt'>): Vessel {
    const newVessel: Vessel = {
      ...vessel,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.store.vessels.push(newVessel);
    this.saveToStorage();


    return newVessel;
  }

  public updateVessel(id: string, updates: Partial<Vessel>): void {
    const index = this.store.vessels.findIndex((v) => v.id === id);
    if (index >= 0) {
      this.store.vessels[index] = {
        ...this.store.vessels[index],
        ...updates,
        updatedAt: new Date().toISOString(),
      };
      this.saveToStorage();


    }
  }

  public async addVoyage(input: Partial<Voyage>): Promise<Voyage> {
    if (!input.vesselId || !input.voyageNumber?.trim()) throw new Error('Select a vessel and enter a voyage number.');
    const now = new Date().toISOString();
    const start = input.plannedUnloadStart || now;
    const finish = input.forecastUnloadEnd || start;
    const manufacturer = this.store.voyages.find(v => v.manufacturerName === input.manufacturerName);
    const voyage: Voyage = {
      id: crypto.randomUUID(), vesselId: input.vesselId, vesselName: this.store.vessels.find(v=>v.id===input.vesselId)?.name || '',
      voyageNumber: input.voyageNumber, status:'PLANNED', origin:'',destination:'',cycleStart:now,
      assignedBerthId:input.assignedBerthId || this.store.berths[0]?.id || '',cargoType:'Bulk Cement',
      plannedCargoT:0,actualCargoT:0,unloadedTonnes:0,unloadingRateTph:this.store.systemSettings.defaultUnloadingRateTph,
      plannedUnloadStart:start,plannedUnloadEnd:finish,forecastUnloadEnd:finish,expectedBerthRelease:finish,postUnloadBufferHours:1.5,
      fuelRequired:false,outboundDeparturePlanned:finish,outboundDepartureForecast:finish,
      manufacturerId:manufacturer?.manufacturerId || crypto.randomUUID(),manufacturerName:input.manufacturerName || 'Manufacturer',
      manufacturerEtaPlanned:finish,manufacturerEtaForecast:finish,manufacturerSlotPlanned:finish,manufacturerSlotForecast:finish,
      manufacturerLoadingEndForecast:finish,manufacturerDeparturePlanned:finish,manufacturerDepartureForecast:finish,
      returnEtaPlanned:finish,returnEtaForecast:finish,currentStage:'PLANNED',health:'READY',risk:'UNKNOWN',currentBlocker:'NONE',blockerDescription:'',
      berthConflict:false,predictedAnchorageWaitHours:0,createdAt:now,updatedAt:now,...input,
    };
    if (!USE_MOCK_API) {
      await this.prepareBerthChange();this.localChangeVersion++;
      const saved=await apiFetch<Voyage>('/voyages',{method:'POST',body:JSON.stringify(voyage)});
      await this.syncFromBackend();return saved;
    }
    this.store.voyages.push(voyage); this.recalculateAll(); this.saveToStorage(); return voyage;
  }

  public async addFuelOperation(input: Partial<FuelOperation>): Promise<FuelOperation> {
    const voyage = this.store.voyages.find(v=>v.id===input.voyageId && v.vesselId===input.vesselId);
    if (!voyage) throw new Error('Create a voyage for this vessel before scheduling fuel.');
    const now=new Date().toISOString();
    const supplierId=this.store.fuelOperations.find(f=>f.supplierName===input.supplierName)?.supplierId || crypto.randomUUID();
    const accountId=crypto.randomUUID();
    const fuel: FuelOperation={id:crypto.randomUUID(),voyageId:voyage.id,vesselId:voyage.vesselId,supplierId,supplierName:input.supplierName || 'Supplier',fuelType:'MGO',quantity:0,unit:'MT',estimatedCost:0,currency:'USD',paymentAccountId:accountId,scheduledStart:now,scheduledEnd:now,status:'REQUESTED',invoiceNumber:'',createdAt:now,updatedAt:now,...input};
    const account: PaymentAccount = {id:accountId,vesselId:fuel.vesselId,voyageId:fuel.voyageId,category:'FUEL',counterpartyId:supplierId,counterpartyName:fuel.supplierName,invoiceNumber:fuel.invoiceNumber,requiredAmount:fuel.estimatedCost,currency:fuel.currency,eligibilityThresholdType:'FULL',eligibilityThresholdValue:100,deadline:fuel.scheduledStart,status:'PENDING',isEligible:false,createdAt:now,updatedAt:now};
    if (!USE_MOCK_API) {
      await this.prepareBerthChange();this.localChangeVersion++;
      await apiFetch('/fuel-operations',{method:'POST',body:JSON.stringify({fuel,account})});
      await this.syncFromBackend();return fuel;
    }
    this.store.paymentAccounts.push(account);
    this.store.fuelOperations.push(fuel);voyage.fuelRequired=true;voyage.fuelOperationId=fuel.id;
    this.recalculateAll();this.saveToStorage();return fuel;
  }

  public acknowledgeAlert(id: string): void {
    const ids = this.store.systemSettings.acknowledgedAlertIds || [];
    this.store.systemSettings.acknowledgedAlertIds = [...new Set([...ids,id])];
    this.saveToStorage();
  }

  public async addBerth(berth: Omit<Berth, 'createdAt' | 'updatedAt'>): Promise<Berth> {
    if (this.store.berths.some(b => b.id.toLowerCase() === berth.id.trim().toLowerCase())) throw new Error('A berth with this ID already exists.');
    if (!USE_MOCK_API) {
      await this.prepareBerthChange();
      this.localChangeVersion++;
      await apiFetch('/berths', {method:'POST',body:JSON.stringify(berth)});
      await this.syncFromBackend();
      return this.store.berths.find(b => b.id === berth.id)!;
    }
    const row = {...berth,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
    this.store.berths.push(row);this.saveToStorage();return row;
  }

  private async prepareBerthChange(): Promise<void> {
    while (this.stateSyncInFlight) await new Promise(resolve => setTimeout(resolve,25));
    await this.persistOperationalState();
    if (this.stateBlocked || this.stateDirty) throw new Error('Refresh or save outstanding changes before changing berths.');
  }

  public async removeBerth(id: string): Promise<void> {
    if (!USE_MOCK_API) {
      await this.prepareBerthChange();
      this.localChangeVersion++;
      await apiFetch('/berths/'+encodeURIComponent(id),{method:'DELETE'});
      await this.syncFromBackend();return;
    }
    if(this.store.voyages.some(v=>v.assignedBerthId===id)) throw new Error('This berth is linked to a voyage and cannot be removed.');
    this.store.berths=this.store.berths.filter(b=>b.id!==id);this.saveToStorage();
  }

  public updateBerth(id: string, updates: Partial<Berth>): void {
    const index = this.store.berths.findIndex((b) => b.id === id);
    if (index >= 0) {
      this.store.berths[index] = {
        ...this.store.berths[index],
        ...updates,
        updatedAt: new Date().toISOString(),
      };
      this.saveToStorage();
    }
  }

  public addPaymentTransaction(
    txn: Omit<PaymentTransaction, 'id' | 'createdAt'>
  ): PaymentTransaction {
    const newTxn: PaymentTransaction = {
      ...txn,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    };
    this.store.paymentTransactions.push(newTxn);
    this.recalculateAll();
    this.saveToStorage();
    return newTxn;
  }

  public async addOperationalReading(
    reading: Omit<OperationalReading, 'id'>
  ): Promise<OperationalReading> {
    const newReading: OperationalReading = {
      ...reading,
      id: crypto.randomUUID(),
    };
    this.store.operationalReadings.unshift(newReading);

    // Update the voyage cargo & rates directly
    const voyage = this.store.voyages.find((v) => v.id === reading.voyageId);
    if (voyage) {
      voyage.unloadedTonnes = reading.unloadedTonnes;
      voyage.unloadingRateTph = reading.observedRateTph;

      const forecast = calculateUnloadingForecast(
        voyage,
        newReading,
        this.store.systemSettings.postUnloadBerthBufferHours
      );
      if (forecast.isAvailable) {
        voyage.forecastUnloadEnd = forecast.forecastUnloadEnd;
        voyage.expectedBerthRelease = forecast.expectedBerthRelease;
      }
    }

    this.recalculateAll();
    this.saveToStorage();


    return newReading;
  }

  public async addDelayEvent(delay: Omit<DelayEvent, 'id' | 'createdAt'>): Promise<DelayEvent> {
    const newDelay: DelayEvent = {
      ...delay,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    };
    this.store.delayEvents.unshift(newDelay);
    this.recalculateAll();
    this.saveToStorage();



    return newDelay;
  }

  public resolveDelay(id: string, endTime = new Date().toISOString()): void {
    const delay = this.store.delayEvents.find((d) => d.id === id);
    if (delay) {
      delay.resolved = true;
      delay.end = endTime;
      this.recalculateAll();
      this.saveToStorage();
    }
  }

  public updateFuelSchedule(
    id: string,
    scheduledStart: string,
    scheduledEnd: string,
    status?: FuelOperation['status']
  ): void {
    const fuel = this.store.fuelOperations.find((f) => f.id === id);
    if (fuel) {
      fuel.scheduledStart = scheduledStart;
      fuel.scheduledEnd = scheduledEnd;
      if (status) fuel.status = status;
      fuel.updatedAt = new Date().toISOString();
      this.recalculateAll();
      this.saveToStorage();
    }
  }

  public updateManufacturerConfirmation(
    queueId: string,
    confirmedSlot: string,
    confirmedPosition?: number
  ): void {
    const item = this.store.manufacturerQueue.find((q) => q.id === queueId);
    if (item) {
      item.confirmedSlot = confirmedSlot;
      if (confirmedPosition) item.confirmedQueuePosition = confirmedPosition;
      item.queueSource = 'MANUFACTURER_CONFIRMED';
      item.status = 'WAITING';

      if (item.voyageId) {
        const voyage = this.store.voyages.find((v) => v.id === item.voyageId);
        if (voyage) {
          voyage.manufacturerSlotConfirmed = confirmedSlot;
          voyage.manufacturerSlotForecast = confirmedSlot;
        }
      }
      this.recalculateAll();
      this.saveToStorage();
    }
  }

  public updateSystemSettings(settings: Partial<SystemSettings>): void {
    this.store.systemSettings = {
      ...this.store.systemSettings,
      ...settings,
    };
    this.recalculateAll();
    this.saveToStorage();
  }

  public applyWhatIfScenario(scenario: WhatIfScenario | undefined): void {
    this.store.activeScenario = scenario;
    this.recalculateAll();
    this.saveToStorage();
  }

  public loadPresetScenario(type: 'BASELINE' | 'SOLVE_PAYMENT' | 'SOLVE_BERTH'): void {
    if (type === 'BASELINE') {
      this.resetDemoData();
      return;
    }

    if (type === 'SOLVE_PAYMENT') {
      // Find manufacturer payment for voy-01 and clear the remaining amount
      const mfrPmt = this.store.paymentAccounts.find(
        (p) => p.voyageId === 'voy-01' && p.category === 'MANUFACTURER'
      );
      if (mfrPmt) {
        const currentTxns = this.store.paymentTransactions.filter(
          (t) => t.paymentAccountId === mfrPmt.id
        );
        const paidSoFar = currentTxns.reduce((sum, t) => sum + t.amount, 0);
        const remaining = Math.max(0, mfrPmt.requiredAmount - paidSoFar);

        if (remaining > 0) {
          this.addPaymentTransaction({
            paymentAccountId: mfrPmt.id,
            vesselId: 'v-01',
            voyageId: 'voy-01',
            category: 'MANUFACTURER',
            amount: remaining,
            currency: 'TZS',
            transactionDate: new Date().toISOString(),
            paymentMethod: 'Bank Wire / RTGS',
            referenceNumber: `RTGS-SOLVE-${Date.now().toString().slice(-4)}`,
            enteredBy: 'Treasury Controller',
            notes: 'Preset scenario clearance: Unlocks Twiga loading queue eligibility.',
          });
        }
      }
      return;
    }

    if (type === 'SOLVE_BERTH') {
      // Adjust MV VIGOR 03 schedule so arrival aligns with expected B01 release
      const voy01 = this.store.voyages.find((v) => v.id === 'voy-01');
      const voy03 = this.store.voyages.find((v) => v.id === 'voy-03');

      if (voy01 && voy03) {
        // Set V03 arrival to 30 mins after B01 berth release
        const targetArrival = new Date(
          new Date(voy01.expectedBerthRelease).getTime() + 30 * 60000
        ).toISOString();
        voy03.returnEtaForecast = targetArrival;
        voy03.conflictNotes = 'Arrival schedule optimized to sync with MV VIGOR 01 departure from B01.';
        voy03.berthConflict = false;
        voy03.predictedAnchorageWaitHours = 0;
        this.recalculateAll();
        this.saveToStorage();
      }
    }
  }

  // -------------------------------------------------------------------------
  // Activity Engine Methods
  // -------------------------------------------------------------------------

  public getActivities(vesselId?: string): VesselActivity[] {
    if (!this.store.activities) {
      this.store.activities = USE_MOCK_API ? getInitialDemoData().activities : [];
    }
    if (vesselId) {
      return this.store.activities
        .filter((a) => a.vesselId === vesselId)
        .sort((a, b) => a.sequenceNo - b.sequenceNo);
    }
    return [...this.store.activities].sort((a, b) => a.sequenceNo - b.sequenceNo);
  }

  public async startActivity(
    activityId: string,
    options?: {
      startedAt?: string;
      resolution?: ActivityConflictResolution;
      overrideDependencyReason?: string;
    }
  ): Promise<{ activity: VesselActivity; conflict?: { currentActivity: VesselActivity; message: string } }> {
    if (!USE_MOCK_API) return this.remoteActivity('/activities/'+activityId+'/start', {started_at:options?.startedAt,current_activity_resolution:options?.resolution,override_dependency_reason:options?.overrideDependencyReason});
    const act = this.store.activities.find((a) => a.id === activityId);
    if (!act) throw new Error(`Activity ${activityId} not found`);

    const now = options?.startedAt || new Date().toISOString();

    // Check concurrency for primary
    if (act.executionMode === 'PRIMARY') {
      const activePrimary = this.store.activities.find(
        (a) => a.vesselId === act.vesselId && a.id !== act.id && a.executionMode === 'PRIMARY' && a.status === 'IN_PROGRESS'
      );
      if (activePrimary) {
        if (!options?.resolution || options.resolution.action === 'NONE') {
          return {
            activity: act,
            conflict: {
              currentActivity: activePrimary,
              message: `Vessel already has primary activity in progress: ${activePrimary.title}`,
            },
          };
        }
        if (options.resolution.action === 'COMPLETE') {
          await this.completeActivity(activePrimary.id, {
            actualEnd: now,
            completionNotes: `Auto-completed to start ${act.title}`,
          });
        } else if (options.resolution.action === 'STOP') {
          await this.stopActivity(activePrimary.id, options.resolution.reason || `Stopped for ${act.title}`);
        } else if (options.resolution.action === 'CANCEL') {
          await this.cancelActivity(activePrimary.id, options.resolution.reason || `Cancelled for ${act.title}`);
        }
      }
    }

    act.status = 'IN_PROGRESS';
    act.actualStart = act.actualStart || now;
    act.stoppedAt = undefined;
    act.stopReason = undefined;
    act.updatedAt = now;

    // Sync voyage currentStage
    const voyage = this.store.voyages.find((v) => v.id === act.voyageId || v.vesselId === act.vesselId);
    if (voyage) {
      if (act.activityType === 'VIGOR_UNLOADING') voyage.currentStage = 'UNLOADING';
      else if (act.activityType === 'VIGOR_BERTHING') voyage.currentStage = 'BERTHED_AT_VIGOR';
      else if (act.activityType === 'FUEL') voyage.currentStage = 'FUEL_IN_PROGRESS';
      else if (act.activityType === 'OUTBOUND_VOYAGE') voyage.currentStage = 'SAILING_TO_MANUFACTURER';
      else if (act.activityType === 'MANUFACTURER_QUEUE') voyage.currentStage = 'WAITING_AT_MANUFACTURER';
      else if (act.activityType === 'MANUFACTURER_LOADING') voyage.currentStage = 'LOADING';
      else if (act.activityType === 'RETURN_VOYAGE') voyage.currentStage = 'RETURNING_TO_VIGOR';
    }

    this.recalculateAll();
    this.saveToStorage();

    // Call backend endpoint if available
    try {
      await apiFetch(`/activities/${activityId}/start`, {
        method: 'POST',
        body: JSON.stringify({
          started_at: now,
          current_activity_resolution: options?.resolution,
          override_dependency_reason: options?.overrideDependencyReason,
        }),
      });
    } catch {}

    return { activity: act };
  }

  public async stopActivity(activityId: string, reason: string, notes?: string): Promise<VesselActivity> {
    if (!USE_MOCK_API) return this.remoteActivity('/activities/'+activityId+'/stop',{reason,notes});
    const act = this.store.activities.find((a) => a.id === activityId);
    if (!act) throw new Error(`Activity ${activityId} not found`);

    const now = new Date().toISOString();
    act.status = 'STOPPED';
    act.stoppedAt = now;
    act.stopReason = reason;
    act.updatedAt = now;

    this.recalculateAll();
    this.saveToStorage();

    try {
      await apiFetch(`/activities/${activityId}/stop`, {
        method: 'POST',
        body: JSON.stringify({ reason, notes }),
      });
    } catch {}

    return act;
  }

  public async resumeActivity(activityId: string, notes?: string): Promise<VesselActivity> {
    if (!USE_MOCK_API) return this.remoteActivity('/activities/'+activityId+'/resume',{notes});
    const act = this.store.activities.find((a) => a.id === activityId);
    if (!act) throw new Error(`Activity ${activityId} not found`);

    const now = new Date().toISOString();
    act.status = 'IN_PROGRESS';
    act.stoppedAt = undefined;
    act.stopReason = undefined;
    act.updatedAt = now;

    this.recalculateAll();
    this.saveToStorage();

    try {
      await apiFetch(`/activities/${activityId}/resume`, {
        method: 'POST',
        body: JSON.stringify({ notes }),
      });
    } catch {}

    return act;
  }

  public async completeActivity(
    activityId: string,
    options?: { actualEnd?: string; completionNotes?: string }
  ): Promise<{ activity: VesselActivity; nextReadyActivities?: VesselActivity[] }> {
    if (!USE_MOCK_API) return this.remoteActivity('/activities/'+activityId+'/complete',{actual_end:options?.actualEnd,completion_notes:options?.completionNotes});
    const act = this.store.activities.find((a) => a.id === activityId);
    if (!act) throw new Error(`Activity ${activityId} not found`);

    const now = options?.actualEnd || new Date().toISOString();
    act.status = 'COMPLETED';
    act.actualEnd = now;
    act.progressPct = 100;
    act.completionNotes = options?.completionNotes;
    act.stoppedAt = undefined;
    act.stopReason = undefined;
    act.updatedAt = now;

    // Evaluate downstream dependencies in memory
    for (const other of this.store.activities) {
      if (other.vesselId === act.vesselId && other.dependencies) {
        const allCompleted = other.dependencies.every((dep) => {
          const p = this.store.activities.find((a) => a.id === dep.dependsOnActivityId);
          return p && (p.status === 'COMPLETED' || p.status === 'SKIPPED');
        });
        if (allCompleted && (other.status === 'PLANNED' || other.status === 'BLOCKED')) {
          other.status = 'READY';
          other.blockerReason = undefined;
        }
      }
    }

    this.recalculateAll();
    this.saveToStorage();

    try {
      await apiFetch(`/activities/${activityId}/complete`, {
        method: 'POST',
        body: JSON.stringify({
          actual_end: now,
          completion_notes: options?.completionNotes,
        }),
      });
    } catch {}

    return { activity: act };
  }

  public async cancelActivity(activityId: string, reason: string, notes?: string): Promise<VesselActivity> {
    if (!USE_MOCK_API) return this.remoteActivity('/activities/'+activityId+'/cancel',{reason,notes});
    const act = this.store.activities.find((a) => a.id === activityId);
    if (!act) throw new Error(`Activity ${activityId} not found`);

    act.status = 'CANCELLED';
    act.cancellationReason = reason;
    act.updatedAt = new Date().toISOString();

    this.recalculateAll();
    this.saveToStorage();

    try {
      await apiFetch(`/activities/${activityId}/cancel`, {
        method: 'POST',
        body: JSON.stringify({ cancellation_reason: reason, reason, notes }),
      });
    } catch {}

    return act;
  }

  public async skipActivity(activityId: string, reason: string, notes?: string): Promise<VesselActivity> {
    if (!USE_MOCK_API) return this.remoteActivity('/activities/'+activityId+'/skip',{reason,notes});
    const act = this.store.activities.find((a) => a.id === activityId);
    if (!act) throw new Error(`Activity ${activityId} not found`);

    act.status = 'SKIPPED';
    act.stopReason = reason;
    act.updatedAt = new Date().toISOString();

    this.recalculateAll();
    this.saveToStorage();

    try {
      await apiFetch(`/activities/${activityId}/skip`, {
        method: 'POST',
        body: JSON.stringify({ reason, notes }),
      });
    } catch {}

    return act;
  }

  public async overrideActivityDependency(activityId: string, reason: string, notes?: string): Promise<VesselActivity> {
    if (!USE_MOCK_API) return (await this.remoteActivity('/activities/'+activityId+'/override-dependency',{reason,notes})).activity;
    const act = this.store.activities.find((a) => a.id === activityId);
    if (!act) throw new Error(`Activity ${activityId} not found`);

    act.status = 'READY';
    act.blockerReason = undefined;
    act.updatedAt = new Date().toISOString();

    this.recalculateAll();
    this.saveToStorage();

    try {
      await apiFetch(`/activities/${activityId}/override-dependency`, {
        method: 'POST',
        body: JSON.stringify({ reason, notes }),
      });
    } catch {}

    return act;
  }

  public async completeAndStartNextActivity(
    currentActivityId: string,
    completionNotes?: string
  ): Promise<{ completedActivity: VesselActivity; nextStartedActivity?: VesselActivity }> {
    if (!USE_MOCK_API) return this.remoteActivity('/activities/'+currentActivityId+'/complete-and-start-next',{completion_notes:completionNotes});
    const current = this.store.activities.find((a) => a.id === currentActivityId);
    if (!current) throw new Error(`Activity ${currentActivityId} not found`);

    const { activity: completed } = await this.completeActivity(currentActivityId, { completionNotes });

    const nextPrimary = this.store.activities
      .filter((a) => a.vesselId === current.vesselId && a.id !== current.id && a.executionMode === 'PRIMARY')
      .filter((a) => a.status === 'READY' || (a.status === 'PLANNED' && a.sequenceNo > current.sequenceNo))
      .sort((a, b) => a.sequenceNo - b.sequenceNo)[0];

    let nextStarted: VesselActivity | undefined = undefined;
    if (nextPrimary) {
      const res = await this.startActivity(nextPrimary.id, { startedAt: new Date().toISOString() });
      nextStarted = res.activity;
    }

    return { completedActivity: completed, nextStartedActivity: nextStarted };
  }

  public async moveActivity(activityId: string, direction: 'UP' | 'DOWN'): Promise<VesselActivity[]> {
    if (!USE_MOCK_API) { await this.remoteActivity('/activities/'+activityId+'/move',{direction}); return this.store.activities; }
    const act = this.store.activities.find((a) => a.id === activityId);
    if (!act) return this.store.activities;

    const vesselActs = this.store.activities
      .filter((a) => a.vesselId === act.vesselId && a.status !== 'COMPLETED')
      .sort((a, b) => a.sequenceNo - b.sequenceNo);

    const idx = vesselActs.findIndex((a) => a.id === act.id);
    if (direction === 'UP' && idx > 0) {
      const swap = vesselActs[idx - 1];
      const tmp = act.sequenceNo;
      act.sequenceNo = swap.sequenceNo;
      swap.sequenceNo = tmp;
    } else if (direction === 'DOWN' && idx < vesselActs.length - 1) {
      const swap = vesselActs[idx + 1];
      const tmp = act.sequenceNo;
      act.sequenceNo = swap.sequenceNo;
      swap.sequenceNo = tmp;
    }

    this.recalculateAll();
    this.saveToStorage();

    try {
      await apiFetch(`/activities/${activityId}/move`, {
        method: 'POST',
        body: JSON.stringify({ direction }),
      });
    } catch {}

    return this.getActivities(act.vesselId);
  }

  public async addActivity(activity: Partial<VesselActivity>): Promise<VesselActivity> {
    if (!USE_MOCK_API) return this.remoteActivity('/activities',activity);
    const id = activity.id || `act-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;
    const now = new Date().toISOString();

    const existing = this.store.activities.filter((a) => a.vesselId === activity.vesselId);
    const maxSeq = existing.reduce((max, a) => Math.max(max, a.sequenceNo), 0);

    const newAct: VesselActivity = {
      id,
      vesselId: activity.vesselId!,
      voyageId: activity.voyageId,
      visitId: activity.visitId,
      berthId: activity.berthId,
      activityType: activity.activityType || 'CUSTOM',
      title: activity.title || 'Operational Activity',
      description: activity.description,
      executionMode: activity.executionMode || 'PRIMARY',
      status: activity.status || 'PLANNED',
      sequenceNo: activity.sequenceNo !== undefined ? activity.sequenceNo : maxSeq + 1,
      priority: activity.priority || 'NORMAL',
      location: activity.location,
      plannedStart: activity.plannedStart || now,
      plannedEnd: activity.plannedEnd,
      forecastStart: activity.forecastStart || activity.plannedStart || now,
      forecastEnd: activity.forecastEnd || activity.plannedEnd,
      estimatedDurationMinutes: activity.estimatedDurationMinutes || 120,
      progressPct: 0,
      blocksNext: activity.blocksNext !== undefined ? activity.blocksNext : true,
      linkedEntityType: activity.linkedEntityType,
      linkedEntityId: activity.linkedEntityId,
      createdBy: 'Operations Dispatcher',
      createdAt: now,
      updatedAt: now,
      dependencies: activity.dependencies || [],
    };

    this.store.activities.push(newAct);
    this.recalculateAll();
    this.saveToStorage();

    try {
      await apiFetch('/activities', {
        method: 'POST',
        body: JSON.stringify(newAct),
      });
    } catch {}

    return newAct;
  }
}

export const api = new ApiClient();
