import { AsyncLocalStorage } from 'node:async_hooks';
import { withOperationalState } from '../operationalRepository';
import { PoolConnection } from 'mysql2/promise';
import { dbManager } from '../database';
import {
  VesselActivity,
  ActivityDependency,
  VesselActivityEvent,
  ActivityStatus,
  ActivityConflictResolution,
  ActivityExecutionMode,
  ActivityPriority,
} from '../../src/types/activity';

// Initial in-memory demo data matching database/demo_seed.sql
let demoActivities: VesselActivity[] = [
  // MV VIGOR 01
  {
    id: 'act-v01-01',
    vesselId: 'v-01',
    voyageId: 'voy-01',
    visitId: 'voy-01',
    berthId: 'B01',
    activityType: 'VIGOR_BERTHING',
    title: 'Berthing at VIGOR B01',
    description: 'Mooring and securing at VIGOR Cement Berth',
    executionMode: 'PRIMARY',
    status: 'COMPLETED',
    sequenceNo: 1,
    priority: 'NORMAL',
    location: 'Berth B01 · Zanzibar',
    plannedStart: new Date(Date.now() - 12 * 3600000).toISOString(),
    plannedEnd: new Date(Date.now() - 10 * 3600000).toISOString(),
    forecastStart: new Date(Date.now() - 12 * 3600000).toISOString(),
    forecastEnd: new Date(Date.now() - 10 * 3600000).toISOString(),
    actualStart: new Date(Date.now() - 12 * 3600000).toISOString(),
    actualEnd: new Date(Date.now() - 10 * 3600000).toISOString(),
    estimatedDurationMinutes: 120,
    progressPct: 100,
    blocksNext: true,
    createdBy: 'usr-003',
    createdAt: new Date(Date.now() - 14 * 3600000).toISOString(),
    updatedAt: new Date(Date.now() - 10 * 3600000).toISOString(),
  },
  {
    id: 'act-v01-02',
    vesselId: 'v-01',
    voyageId: 'voy-01',
    visitId: 'voy-01',
    berthId: 'B01',
    activityType: 'VIGOR_UNLOADING',
    title: 'Unloading Bulk Cement',
    description: 'High-pressure pneumatic cement discharge into Silo 1 & 2',
    executionMode: 'PRIMARY',
    status: 'IN_PROGRESS',
    sequenceNo: 2,
    priority: 'CRITICAL',
    location: 'Berth B01 · Zanzibar',
    plannedStart: new Date(Date.now() - 10 * 3600000).toISOString(),
    plannedEnd: new Date(Date.now() + 4.8 * 3600000).toISOString(),
    forecastStart: new Date(Date.now() - 10 * 3600000).toISOString(),
    forecastEnd: new Date(Date.now() + 4.8 * 3600000).toISOString(),
    actualStart: new Date(Date.now() - 10 * 3600000).toISOString(),
    estimatedDurationMinutes: 890,
    progressPct: 72,
    blocksNext: true,
    createdBy: 'usr-003',
    createdAt: new Date(Date.now() - 14 * 3600000).toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'act-v01-03',
    vesselId: 'v-01',
    voyageId: 'voy-01',
    visitId: 'voy-01',
    berthId: 'B01',
    activityType: 'FUEL',
    title: 'Fuel / Bunkering',
    description: 'MGO Bunkering replenishment via coastal fuel barge',
    executionMode: 'PRIMARY',
    status: 'PLANNED',
    sequenceNo: 3,
    priority: 'HIGH',
    location: 'Berth B01 · Zanzibar',
    plannedStart: new Date(Date.now() + 5 * 3600000).toISOString(),
    plannedEnd: new Date(Date.now() + 7 * 3600000).toISOString(),
    forecastStart: new Date(Date.now() + 5 * 3600000).toISOString(),
    forecastEnd: new Date(Date.now() + 7 * 3600000).toISOString(),
    estimatedDurationMinutes: 120,
    progressPct: 0,
    blocksNext: true,
    createdBy: 'usr-003',
    createdAt: new Date(Date.now() - 14 * 3600000).toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'act-v01-04',
    vesselId: 'v-01',
    voyageId: 'voy-01',
    activityType: 'OUTBOUND_VOYAGE',
    title: 'Sailing to Manufacturer',
    description: 'Outbound passage through Pemba Channel to Tanga Port',
    executionMode: 'PRIMARY',
    status: 'PLANNED',
    sequenceNo: 4,
    priority: 'NORMAL',
    location: 'Zanzibar → Tanga Channel',
    plannedStart: new Date(Date.now() + 8 * 3600000).toISOString(),
    plannedEnd: new Date(Date.now() + 18 * 3600000).toISOString(),
    forecastStart: new Date(Date.now() + 8 * 3600000).toISOString(),
    forecastEnd: new Date(Date.now() + 18 * 3600000).toISOString(),
    estimatedDurationMinutes: 600,
    progressPct: 0,
    blocksNext: true,
    createdBy: 'usr-003',
    createdAt: new Date(Date.now() - 14 * 3600000).toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'act-v01-05',
    vesselId: 'v-01',
    voyageId: 'voy-01',
    activityType: 'MANUFACTURER_QUEUE',
    title: 'Manufacturer Queue & Berthing',
    description: 'Queueing for dedicated loading berth at Tanga Cement',
    executionMode: 'PRIMARY',
    status: 'BLOCKED',
    blockerReason: 'Manufacturer payment threshold not reached (TZS 200M remaining)',
    sequenceNo: 5,
    priority: 'HIGH',
    location: 'Tanga Cement Quay',
    plannedStart: new Date(Date.now() + 18.5 * 3600000).toISOString(),
    plannedEnd: new Date(Date.now() + 20 * 3600000).toISOString(),
    forecastStart: new Date(Date.now() + 18.5 * 3600000).toISOString(),
    forecastEnd: new Date(Date.now() + 20 * 3600000).toISOString(),
    estimatedDurationMinutes: 90,
    progressPct: 0,
    blocksNext: true,
    createdBy: 'usr-003',
    createdAt: new Date(Date.now() - 14 * 3600000).toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'act-v01-06',
    vesselId: 'v-01',
    voyageId: 'voy-01',
    activityType: 'MANUFACTURER_LOADING',
    title: 'Loading Cement at Tanga',
    description: 'Bulk cement loading into vessel cargo holds',
    executionMode: 'PRIMARY',
    status: 'BLOCKED',
    blockerReason: 'Waiting for Manufacturer Queue & Payment',
    sequenceNo: 6,
    priority: 'NORMAL',
    location: 'Tanga Cement Berth 2',
    plannedStart: new Date(Date.now() + 20 * 3600000).toISOString(),
    plannedEnd: new Date(Date.now() + 36 * 3600000).toISOString(),
    forecastStart: new Date(Date.now() + 20 * 3600000).toISOString(),
    forecastEnd: new Date(Date.now() + 36 * 3600000).toISOString(),
    estimatedDurationMinutes: 960,
    progressPct: 0,
    blocksNext: true,
    createdBy: 'usr-003',
    createdAt: new Date(Date.now() - 14 * 3600000).toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'act-v01-07',
    vesselId: 'v-01',
    voyageId: 'voy-01',
    activityType: 'MANUFACTURER_PAYMENT',
    title: 'Manufacturer Advance Payment',
    description: 'CRDB Bank wire transfer for 100% advance loading allocation (TZS 200M pending)',
    executionMode: 'SUPPORT',
    status: 'IN_PROGRESS',
    sequenceNo: 101,
    priority: 'HIGH',
    location: 'Commercial Finance Gateway',
    plannedStart: new Date(Date.now() - 24 * 3600000).toISOString(),
    plannedEnd: new Date(Date.now() + 12 * 3600000).toISOString(),
    forecastStart: new Date(Date.now() - 24 * 3600000).toISOString(),
    forecastEnd: new Date(Date.now() + 12 * 3600000).toISOString(),
    actualStart: new Date(Date.now() - 24 * 3600000).toISOString(),
    estimatedDurationMinutes: 2160,
    progressPct: 60,
    blocksNext: false,
    createdBy: 'usr-001',
    createdAt: new Date(Date.now() - 24 * 3600000).toISOString(),
    updatedAt: new Date().toISOString(),
  },

  // MV VIGOR 02
  {
    id: 'act-v02-01',
    vesselId: 'v-02',
    voyageId: 'voy-02',
    activityType: 'OUTBOUND_VOYAGE',
    title: 'Sailing to Manufacturer',
    description: 'Passage to Tanga Cement terminal',
    executionMode: 'PRIMARY',
    status: 'IN_PROGRESS',
    sequenceNo: 1,
    priority: 'NORMAL',
    location: 'Pemba Channel (Northbound)',
    plannedStart: new Date(Date.now() - 4 * 3600000).toISOString(),
    plannedEnd: new Date(Date.now() + 6 * 3600000).toISOString(),
    forecastStart: new Date(Date.now() - 4 * 3600000).toISOString(),
    forecastEnd: new Date(Date.now() + 6 * 3600000).toISOString(),
    actualStart: new Date(Date.now() - 4 * 3600000).toISOString(),
    estimatedDurationMinutes: 600,
    progressPct: 40,
    blocksNext: true,
    createdBy: 'usr-003',
    createdAt: new Date(Date.now() - 6 * 3600000).toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'act-v02-02',
    vesselId: 'v-02',
    voyageId: 'voy-02',
    activityType: 'MANUFACTURER_QUEUE',
    title: 'Manufacturer Queueing',
    description: 'Awaiting assigned loading slot confirmation',
    executionMode: 'PRIMARY',
    status: 'READY',
    sequenceNo: 2,
    priority: 'NORMAL',
    location: 'Tanga Anchorage / Quay',
    plannedStart: new Date(Date.now() + 6.5 * 3600000).toISOString(),
    plannedEnd: new Date(Date.now() + 8 * 3600000).toISOString(),
    forecastStart: new Date(Date.now() + 6.5 * 3600000).toISOString(),
    forecastEnd: new Date(Date.now() + 8 * 3600000).toISOString(),
    estimatedDurationMinutes: 90,
    progressPct: 0,
    blocksNext: true,
    createdBy: 'usr-003',
    createdAt: new Date(Date.now() - 6 * 3600000).toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'act-v02-03',
    vesselId: 'v-02',
    voyageId: 'voy-02',
    activityType: 'MANUFACTURER_LOADING',
    title: 'Loading Bulk Cement',
    description: 'Loading 10,200T bulk cement at Tanga',
    executionMode: 'PRIMARY',
    status: 'PLANNED',
    sequenceNo: 3,
    priority: 'NORMAL',
    location: 'Tanga Cement Quay',
    plannedStart: new Date(Date.now() + 8 * 3600000).toISOString(),
    plannedEnd: new Date(Date.now() + 24 * 3600000).toISOString(),
    forecastStart: new Date(Date.now() + 8 * 3600000).toISOString(),
    forecastEnd: new Date(Date.now() + 24 * 3600000).toISOString(),
    estimatedDurationMinutes: 960,
    progressPct: 0,
    blocksNext: true,
    createdBy: 'usr-003',
    createdAt: new Date(Date.now() - 6 * 3600000).toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'act-v02-04',
    vesselId: 'v-02',
    voyageId: 'voy-02',
    activityType: 'MANUFACTURER_PAYMENT',
    title: 'Manufacturer Advance Payment',
    description: '100% full advance payment settled (TZS 520M cleared)',
    executionMode: 'SUPPORT',
    status: 'COMPLETED',
    sequenceNo: 101,
    priority: 'NORMAL',
    location: 'CRDB Bank Wire',
    plannedStart: new Date(Date.now() - 24 * 3600000).toISOString(),
    plannedEnd: new Date(Date.now() - 2 * 3600000).toISOString(),
    forecastStart: new Date(Date.now() - 24 * 3600000).toISOString(),
    forecastEnd: new Date(Date.now() - 2 * 3600000).toISOString(),
    actualStart: new Date(Date.now() - 24 * 3600000).toISOString(),
    actualEnd: new Date(Date.now() - 2 * 3600000).toISOString(),
    estimatedDurationMinutes: 1320,
    progressPct: 100,
    blocksNext: false,
    createdBy: 'usr-001',
    createdAt: new Date(Date.now() - 24 * 3600000).toISOString(),
    updatedAt: new Date(Date.now() - 2 * 3600000).toISOString(),
  },

  // MV VIGOR 03
  {
    id: 'act-v03-01',
    vesselId: 'v-03',
    voyageId: 'voy-03',
    activityType: 'RETURN_VOYAGE',
    title: 'Sailing to VIGOR',
    description: 'Southbound passage with 9,800T bulk cement cargo',
    executionMode: 'PRIMARY',
    status: 'IN_PROGRESS',
    sequenceNo: 1,
    priority: 'HIGH',
    location: 'Tanga → Zanzibar Coastal Route',
    plannedStart: new Date(Date.now() - 6 * 3600000).toISOString(),
    plannedEnd: new Date(Date.now() + 3.75 * 3600000).toISOString(),
    forecastStart: new Date(Date.now() - 6 * 3600000).toISOString(),
    forecastEnd: new Date(Date.now() + 3.75 * 3600000).toISOString(),
    actualStart: new Date(Date.now() - 6 * 3600000).toISOString(),
    estimatedDurationMinutes: 585,
    progressPct: 62,
    blocksNext: true,
    createdBy: 'usr-003',
    createdAt: new Date(Date.now() - 8 * 3600000).toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'act-v03-02',
    vesselId: 'v-03',
    voyageId: 'voy-03',
    visitId: 'voy-03',
    berthId: 'B01',
    activityType: 'WAITING_FOR_VIGOR_BERTH',
    title: 'Waiting for VIGOR Berth B01',
    description: 'Anchorage waiting pending Berth B01 clearance by MV VIGOR 01',
    executionMode: 'PRIMARY',
    status: 'PLANNED',
    sequenceNo: 2,
    priority: 'CRITICAL',
    location: 'Zanzibar Anchorage Outer Roads',
    plannedStart: new Date(Date.now() + 3.75 * 3600000).toISOString(),
    plannedEnd: new Date(Date.now() + 6.4 * 3600000).toISOString(),
    forecastStart: new Date(Date.now() + 3.75 * 3600000).toISOString(),
    forecastEnd: new Date(Date.now() + 6.4 * 3600000).toISOString(),
    estimatedDurationMinutes: 160,
    progressPct: 0,
    blocksNext: true,
    createdBy: 'usr-003',
    createdAt: new Date(Date.now() - 8 * 3600000).toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'act-v03-03',
    vesselId: 'v-03',
    voyageId: 'voy-03',
    visitId: 'voy-03',
    berthId: 'B01',
    activityType: 'VIGOR_BERTHING',
    title: 'Berthing at VIGOR B01',
    description: 'Mooring alongside VIGOR dedicated pneumatic berth',
    executionMode: 'PRIMARY',
    status: 'PLANNED',
    sequenceNo: 3,
    priority: 'HIGH',
    location: 'Berth B01 · Zanzibar',
    plannedStart: new Date(Date.now() + 6.5 * 3600000).toISOString(),
    plannedEnd: new Date(Date.now() + 7.5 * 3600000).toISOString(),
    forecastStart: new Date(Date.now() + 6.5 * 3600000).toISOString(),
    forecastEnd: new Date(Date.now() + 7.5 * 3600000).toISOString(),
    estimatedDurationMinutes: 60,
    progressPct: 0,
    blocksNext: true,
    createdBy: 'usr-003',
    createdAt: new Date(Date.now() - 8 * 3600000).toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'act-v03-04',
    vesselId: 'v-03',
    voyageId: 'voy-03',
    visitId: 'voy-03',
    berthId: 'B01',
    activityType: 'VIGOR_UNLOADING',
    title: 'Unloading Bulk Cement',
    description: 'Direct discharge into VIGOR Silo 1 & 2',
    executionMode: 'PRIMARY',
    status: 'PLANNED',
    sequenceNo: 4,
    priority: 'NORMAL',
    location: 'Berth B01 · Zanzibar',
    plannedStart: new Date(Date.now() + 7.5 * 3600000).toISOString(),
    plannedEnd: new Date(Date.now() + 24.5 * 3600000).toISOString(),
    forecastStart: new Date(Date.now() + 7.5 * 3600000).toISOString(),
    forecastEnd: new Date(Date.now() + 24.5 * 3600000).toISOString(),
    estimatedDurationMinutes: 1020,
    progressPct: 0,
    blocksNext: true,
    createdBy: 'usr-003',
    createdAt: new Date(Date.now() - 8 * 3600000).toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

let demoDependencies: ActivityDependency[] = [
  { id: 'dep-v01-01', activityId: 'act-v01-02', dependsOnActivityId: 'act-v01-01', requiredStatus: 'COMPLETED', createdAt: new Date().toISOString() },
  { id: 'dep-v01-02', activityId: 'act-v01-03', dependsOnActivityId: 'act-v01-02', requiredStatus: 'COMPLETED', createdAt: new Date().toISOString() },
  { id: 'dep-v01-03', activityId: 'act-v01-04', dependsOnActivityId: 'act-v01-03', requiredStatus: 'COMPLETED', createdAt: new Date().toISOString() },
  { id: 'dep-v01-04', activityId: 'act-v01-05', dependsOnActivityId: 'act-v01-04', requiredStatus: 'COMPLETED', createdAt: new Date().toISOString() },
  { id: 'dep-v01-05', activityId: 'act-v01-05', dependsOnActivityId: 'act-v01-07', requiredStatus: 'COMPLETED', createdAt: new Date().toISOString() },
  { id: 'dep-v01-06', activityId: 'act-v01-06', dependsOnActivityId: 'act-v01-05', requiredStatus: 'COMPLETED', createdAt: new Date().toISOString() },

  { id: 'dep-v02-01', activityId: 'act-v02-02', dependsOnActivityId: 'act-v02-01', requiredStatus: 'COMPLETED', createdAt: new Date().toISOString() },
  { id: 'dep-v02-02', activityId: 'act-v02-02', dependsOnActivityId: 'act-v02-04', requiredStatus: 'COMPLETED', createdAt: new Date().toISOString() },
  { id: 'dep-v02-03', activityId: 'act-v02-03', dependsOnActivityId: 'act-v02-02', requiredStatus: 'COMPLETED', createdAt: new Date().toISOString() },

  { id: 'dep-v03-01', activityId: 'act-v03-02', dependsOnActivityId: 'act-v03-01', requiredStatus: 'COMPLETED', createdAt: new Date().toISOString() },
  { id: 'dep-v03-02', activityId: 'act-v03-03', dependsOnActivityId: 'act-v03-02', requiredStatus: 'COMPLETED', createdAt: new Date().toISOString() },
  { id: 'dep-v03-03', activityId: 'act-v03-04', dependsOnActivityId: 'act-v03-03', requiredStatus: 'COMPLETED', createdAt: new Date().toISOString() },
];

let demoEvents: VesselActivityEvent[] = [
  { id: 'evt-01', activityId: 'act-v01-01', vesselId: 'v-01', voyageId: 'voy-01', eventType: 'CREATED', newStatus: 'PLANNED', notes: 'Initial activity plan generated for rotation VY-2025-014', performedBy: 'usr-003', occurredAt: new Date(Date.now() - 14 * 3600000).toISOString() },
  { id: 'evt-02', activityId: 'act-v01-01', vesselId: 'v-01', voyageId: 'voy-01', eventType: 'STARTED', previousStatus: 'READY', newStatus: 'IN_PROGRESS', notes: 'Vessel made fast at Berth B01 quay', performedBy: 'usr-003', occurredAt: new Date(Date.now() - 12 * 3600000).toISOString() },
  { id: 'evt-03', activityId: 'act-v01-01', vesselId: 'v-01', voyageId: 'voy-01', eventType: 'COMPLETED', previousStatus: 'IN_PROGRESS', newStatus: 'COMPLETED', notes: 'Mooring lines tensioned and shore gangway deployed', performedBy: 'usr-003', occurredAt: new Date(Date.now() - 10 * 3600000).toISOString() },
  { id: 'evt-04', activityId: 'act-v01-02', vesselId: 'v-01', voyageId: 'voy-01', eventType: 'STARTED', previousStatus: 'READY', newStatus: 'IN_PROGRESS', notes: 'Pneumatic unloading started. Dual 10-inch lines connected.', performedBy: 'usr-003', occurredAt: new Date(Date.now() - 10 * 3600000).toISOString() },
  { id: 'evt-05', activityId: 'act-v01-02', vesselId: 'v-01', voyageId: 'voy-01', eventType: 'STOPPED', previousStatus: 'IN_PROGRESS', newStatus: 'STOPPED', reason: 'Pneumatic compressor valve gasket replacement on Silo Manifold B', notes: 'Temporarily isolated line 2 for preventive maintenance', performedBy: 'usr-003', occurredAt: new Date(Date.now() - 7 * 3600000).toISOString() },
  { id: 'evt-06', activityId: 'act-v01-02', vesselId: 'v-01', voyageId: 'voy-01', eventType: 'RESUMED', previousStatus: 'STOPPED', newStatus: 'IN_PROGRESS', notes: 'Gasket replaced, pressure test normal. Resumed 605 t/h discharge.', performedBy: 'usr-003', occurredAt: new Date(Date.now() - 6.2 * 3600000).toISOString() },
  { id: 'evt-07', activityId: 'act-v01-02', vesselId: 'v-01', voyageId: 'voy-01', eventType: 'PROGRESS_UPDATED', previousStatus: 'IN_PROGRESS', newStatus: 'IN_PROGRESS', notes: 'Discharge progress reached 72% (7,560T / 10,500T)', performedBy: 'usr-003', occurredAt: new Date().toISOString() },
  { id: 'evt-08', activityId: 'act-v02-04', vesselId: 'v-02', voyageId: 'voy-02', eventType: 'COMPLETED', previousStatus: 'IN_PROGRESS', newStatus: 'COMPLETED', notes: '100% advance payment confirmed by CRDB Bank. Tanga queue unblocked.', performedBy: 'usr-001', occurredAt: new Date(Date.now() - 2 * 3600000).toISOString() },
];

export class ActivityService {
  /**
   * Fetch all activities with optional filters
   */
  public async getActivities(filters?: {
    vesselId?: string;
    voyageId?: string;
    status?: ActivityStatus;
    executionMode?: ActivityExecutionMode;
    activityType?: string;
  }): Promise<VesselActivity[]> {
    // In-memory fallback
    let results = [...engineState().activities];
    if (filters?.vesselId) results = results.filter((a) => a.vesselId === filters.vesselId);
    if (filters?.voyageId) results = results.filter((a) => a.voyageId === filters.voyageId);
    if (filters?.status) results = results.filter((a) => a.status === filters.status);
    if (filters?.executionMode) results = results.filter((a) => a.executionMode === filters.executionMode);
    if (filters?.activityType) results = results.filter((a) => a.activityType === filters.activityType);

    results.sort((a, b) => a.sequenceNo - b.sequenceNo);
    return this.attachDependenciesAndEvents(results);
  }

  public async getActivityById(id: string): Promise<VesselActivity | null> {
    const list = await this.getActivities();
    return list.find((a) => a.id === id) || null;
  }

  public async getVesselActivities(vesselId: string): Promise<VesselActivity[]> {
    return this.getActivities({ vesselId });
  }

  public async getVoyageActivities(voyageId: string): Promise<VesselActivity[]> {
    return this.getActivities({ voyageId });
  }

  /**
   * Helper to attach dependencies & events to activities
   */
  private async attachDependenciesAndEvents(activities: VesselActivity[]): Promise<VesselActivity[]> {
    return activities.map((act) => {
      const deps = engineState().dependencies
        .filter((d) => d.activityId === act.id)
        .map((d) => {
          const parent = engineState().activities.find((p) => p.id === d.dependsOnActivityId);
          return {
            ...d,
            dependsOnActivityTitle: parent?.title,
          };
        });
      const events = engineState().events
        .filter((e) => e.activityId === act.id)
        .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());

      // If blocked, calculate blocker message if missing
      let blockerReason = act.blockerReason;
      if (act.status === 'BLOCKED' && !blockerReason) {
        const unsatisfied = deps.filter((d) => {
          const p = engineState().activities.find((m) => m.id === d.dependsOnActivityId);
          return !p || (p.status !== 'COMPLETED' && p.status !== 'SKIPPED');
        });
        if (unsatisfied.length > 0) {
          blockerReason = `Waiting for: ${unsatisfied.map((u) => u.dependsOnActivityTitle || u.dependsOnActivityId).join(', ')}`;
        }
      }

      return {
        ...act,
        dependencies: deps,
        events,
        blockerReason,
      };
    });
  }

  /**
   * Create a new activity
   */
  public async createActivity(data: Partial<VesselActivity>, userEmail = 'ops.dispatcher@turkysgroup.co.tz'): Promise<VesselActivity> {
    const id = data.id || `act-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;
    const now = new Date().toISOString();

    const existingVesselActs = engineState().activities.filter((a) => a.vesselId === data.vesselId);
    const maxSeq = existingVesselActs.reduce((max, a) => Math.max(max, a.sequenceNo), 0);

    const newActivity: VesselActivity = {
      id,
      vesselId: data.vesselId!,
      voyageId: data.voyageId,
      visitId: data.visitId,
      berthId: data.berthId,
      activityType: data.activityType || 'CUSTOM',
      title: data.title || 'Operational Activity',
      description: data.description,
      executionMode: data.executionMode || 'PRIMARY',
      status: data.status || 'PLANNED',
      sequenceNo: data.sequenceNo !== undefined ? data.sequenceNo : maxSeq + 1,
      priority: data.priority || 'NORMAL',
      location: data.location || (data.activityType === 'VIGOR_UNLOADING' ? 'Berth B01 · Zanzibar' : undefined),
      plannedStart: data.plannedStart || now,
      plannedEnd: data.plannedEnd,
      forecastStart: data.forecastStart || data.plannedStart || now,
      forecastEnd: data.forecastEnd || data.plannedEnd,
      estimatedDurationMinutes: data.estimatedDurationMinutes || 120,
      progressPct: 0,
      blocksNext: data.blocksNext !== undefined ? data.blocksNext : true,
      linkedEntityType: data.linkedEntityType,
      linkedEntityId: data.linkedEntityId,
      createdBy: userEmail,
      createdAt: now,
      updatedAt: now,
    };

    engineState().activities.push(newActivity);

    // Record CREATED event
    this.recordEvent({
      activityId: id,
      vesselId: newActivity.vesselId,
      voyageId: newActivity.voyageId,
      eventType: 'CREATED',
      newStatus: newActivity.status,
      notes: `Activity created: ${newActivity.title}`,
      performedBy: userEmail,
    });

    // Evaluate dependencies if any provided
    if (data.dependencies && Array.isArray(data.dependencies)) {
      for (const dep of data.dependencies) {
        engineState().dependencies.push({
          id: `dep-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 5)}`,
          activityId: id,
          dependsOnActivityId: dep.dependsOnActivityId,
          requiredStatus: dep.requiredStatus || 'COMPLETED',
          createdAt: now,
        });
      }
    }

    await this.evaluateDependenciesForVessel(newActivity.vesselId);
    return (await this.getActivityById(id))!;
  }

  /**
   * START ACTIVITY
   * Handles Primary vs Support execution mode rules & conflict resolution
   */
  public async startActivity(
    activityId: string,
    options?: {
      startedAt?: string;
      resolution?: ActivityConflictResolution;
      overrideDependencyReason?: string;
    },
    userEmail = 'ops.dispatcher@turkysgroup.co.tz'
  ): Promise<{
    activity: VesselActivity;
    conflict?: { currentActivity: VesselActivity; message: string };
    updatedStage?: string;
  }> {
    const act = engineState().activities.find((a) => a.id === activityId);
    if (!act) throw new Error(`Activity ${activityId} not found`);

    const now = options?.startedAt || new Date().toISOString();

    // Check dependencies
    const actDeps = engineState().dependencies.filter((d) => d.activityId === act.id);
    const unmet = actDeps.filter((d) => {
      const parent = engineState().activities.find((p) => p.id === d.dependsOnActivityId);
      return !parent || (parent.status !== 'COMPLETED' && parent.status !== 'SKIPPED');
    });

    if (unmet.length > 0 && !options?.overrideDependencyReason) {
      act.status = 'BLOCKED';
      act.blockerReason = `Blocked by dependency: ${unmet.map((u) => u.dependsOnActivityId).join(', ')}`;
      throw new Error(`Cannot start activity: dependencies are not completed. (${act.blockerReason})`);
    }

    if (unmet.length > 0 && options?.overrideDependencyReason) {
      this.recordEvent({
        activityId: act.id,
        vesselId: act.vesselId,
        voyageId: act.voyageId,
        eventType: 'DEPENDENCY_OVERRIDDEN',
        newStatus: 'READY',
        reason: options.overrideDependencyReason,
        notes: `Dependency overridden by ${userEmail}`,
        performedBy: userEmail,
      });
    }

    // PRIMARY CONCURRENCY CHECK (Requirement 6 & 7)
    if (act.executionMode === 'PRIMARY') {
      const activePrimary = engineState().activities.find(
        (a) => a.vesselId === act.vesselId && a.id !== act.id && a.executionMode === 'PRIMARY' && a.status === 'IN_PROGRESS'
      );

      if (activePrimary) {
        if (!options?.resolution || options.resolution.action === 'NONE') {
          // Return 409 Conflict indication
          return {
            activity: act,
            conflict: {
              currentActivity: activePrimary,
              message: `Vessel already has a primary activity in progress: ${activePrimary.title}`,
            },
          };
        }

        // Apply resolution
        if (options.resolution.action === 'COMPLETE') {
          await this.completeActivity(activePrimary.id, {
            actualEnd: now,
            completionNotes: `Automatically completed to start ${act.title}`,
          }, userEmail);
        } else if (options.resolution.action === 'STOP') {
          await this.stopActivity(activePrimary.id, {
            reason: options.resolution.reason || `Temporarily stopped to start ${act.title}`,
          }, userEmail);
        } else if (options.resolution.action === 'CANCEL') {
          await this.cancelActivity(activePrimary.id, {
            reason: options.resolution.reason || `Cancelled to initiate ${act.title}`,
          }, userEmail);
        }
      }
    }

    // Set to IN_PROGRESS
    const prevStatus = act.status;
    act.status = 'IN_PROGRESS';
    act.actualStart = act.actualStart || now;
    act.stoppedAt = undefined;
    act.stopReason = undefined;
    act.updatedAt = now;

    this.recordEvent({
      activityId: act.id,
      vesselId: act.vesselId,
      voyageId: act.voyageId,
      eventType: 'STARTED',
      previousStatus: prevStatus,
      newStatus: 'IN_PROGRESS',
      performedBy: userEmail,
      occurredAt: now,
    });

    // Synchronize voyage stage & berth
    const updatedStage = this.syncVoyageStage(act);
    this.syncBerthState(act);

    return { activity: act, updatedStage };
  }

  /**
   * STOP ACTIVITY (temporarily halts with reason)
   */
  public async stopActivity(
    activityId: string,
    options: { reason: string; notes?: string },
    userEmail = 'ops.dispatcher@turkysgroup.co.tz'
  ): Promise<VesselActivity> {
    const act = engineState().activities.find((a) => a.id === activityId);
    if (!act) throw new Error(`Activity ${activityId} not found`);
    if (!options.reason || !options.reason.trim()) {
      throw new Error('Stop reason is strictly required.');
    }

    const now = new Date().toISOString();
    const prevStatus = act.status;
    act.status = 'STOPPED';
    act.stoppedAt = now;
    act.stopReason = options.reason.trim();
    act.updatedAt = now;

    this.recordEvent({
      activityId: act.id,
      vesselId: act.vesselId,
      voyageId: act.voyageId,
      eventType: 'STOPPED',
      previousStatus: prevStatus,
      newStatus: 'STOPPED',
      reason: options.reason,
      notes: options.notes,
      performedBy: userEmail,
      occurredAt: now,
    });

    // Downstream forecast times shift
    this.shiftDownstreamForecasts(act, 60); // estimate 60 min delay baseline
    return act;
  }

  /**
   * RESUME ACTIVITY
   */
  public async resumeActivity(
    activityId: string,
    options?: { notes?: string },
    userEmail = 'ops.dispatcher@turkysgroup.co.tz'
  ): Promise<VesselActivity> {
    const act = engineState().activities.find((a) => a.id === activityId);
    if (!act) throw new Error(`Activity ${activityId} not found`);
    if (act.status !== 'STOPPED') throw new Error('Only STOPPED activities can be resumed.');

    const now = new Date().toISOString();
    const prevStatus = act.status;
    act.status = 'IN_PROGRESS';
    act.stoppedAt = undefined;
    act.stopReason = undefined;
    act.updatedAt = now;

    this.recordEvent({
      activityId: act.id,
      vesselId: act.vesselId,
      voyageId: act.voyageId,
      eventType: 'RESUMED',
      previousStatus: prevStatus,
      newStatus: 'IN_PROGRESS',
      notes: options?.notes || 'Activity resumed',
      performedBy: userEmail,
      occurredAt: now,
    });

    return act;
  }

  /**
   * COMPLETE ACTIVITY
   */
  public async completeActivity(
    activityId: string,
    options?: { actualEnd?: string; completionNotes?: string },
    userEmail = 'ops.dispatcher@turkysgroup.co.tz'
  ): Promise<{ activity: VesselActivity; nextReadyActivities: VesselActivity[] }> {
    const act = engineState().activities.find((a) => a.id === activityId);
    if (!act) throw new Error(`Activity ${activityId} not found`);

    const now = options?.actualEnd || new Date().toISOString();
    const prevStatus = act.status;
    act.status = 'COMPLETED';
    act.actualEnd = now;
    act.progressPct = 100;
    act.completionNotes = options?.completionNotes;
    act.stoppedAt = undefined;
    act.stopReason = undefined;
    act.updatedAt = now;

    this.recordEvent({
      activityId: act.id,
      vesselId: act.vesselId,
      voyageId: act.voyageId,
      eventType: 'COMPLETED',
      previousStatus: prevStatus,
      newStatus: 'COMPLETED',
      notes: options?.completionNotes,
      performedBy: userEmail,
      occurredAt: now,
    });

    // Evaluate downstream dependencies for this vessel
    const nextReadyActivities = await this.evaluateDependenciesForVessel(act.vesselId);

    // Sync berth if completed was unloading or berthing
    if (act.activityType === 'VIGOR_UNLOADING' || act.activityType === 'VIGOR_POST_UNLOAD') {
      // Check if any other primary activity at B01 is running
      const anotherB01 = engineState().activities.find(
        (a) => a.berthId === 'B01' && a.id !== act.id && (a.status === 'IN_PROGRESS' || a.status === 'STOPPED')
      );
      if (!anotherB01) {
        // Berth will be available
      }
    }

    return { activity: act, nextReadyActivities };
  }

  /**
   * CANCEL ACTIVITY
   */
  public async cancelActivity(
    activityId: string,
    options: { reason: string; notes?: string },
    userEmail = 'ops.dispatcher@turkysgroup.co.tz'
  ): Promise<VesselActivity> {
    const act = engineState().activities.find((a) => a.id === activityId);
    if (!act) throw new Error(`Activity ${activityId} not found`);
    if (!options.reason || !options.reason.trim()) {
      throw new Error('Cancellation reason is strictly required.');
    }

    const now = new Date().toISOString();
    const prevStatus = act.status;
    act.status = 'CANCELLED';
    act.cancellationReason = options.reason.trim();
    act.updatedAt = now;

    this.recordEvent({
      activityId: act.id,
      vesselId: act.vesselId,
      voyageId: act.voyageId,
      eventType: 'CANCELLED',
      previousStatus: prevStatus,
      newStatus: 'CANCELLED',
      reason: options.reason,
      notes: options.notes,
      performedBy: userEmail,
      occurredAt: now,
    });

    await this.evaluateDependenciesForVessel(act.vesselId);
    return act;
  }

  /**
   * SKIP ACTIVITY
   */
  public async skipActivity(
    activityId: string,
    options: { reason: string; notes?: string },
    userEmail = 'ops.dispatcher@turkysgroup.co.tz'
  ): Promise<VesselActivity> {
    const act = engineState().activities.find((a) => a.id === activityId);
    if (!act) throw new Error(`Activity ${activityId} not found`);
    if (!options.reason || !options.reason.trim()) {
      throw new Error('Skip reason is strictly required.');
    }

    const now = new Date().toISOString();
    const prevStatus = act.status;
    act.status = 'SKIPPED';
    act.stopReason = options.reason.trim();
    act.updatedAt = now;

    this.recordEvent({
      activityId: act.id,
      vesselId: act.vesselId,
      voyageId: act.voyageId,
      eventType: 'SKIPPED',
      previousStatus: prevStatus,
      newStatus: 'SKIPPED',
      reason: options.reason,
      notes: options.notes,
      performedBy: userEmail,
      occurredAt: now,
    });

    await this.evaluateDependenciesForVessel(act.vesselId);
    return act;
  }

  /**
   * COMPLETE CURRENT & START NEXT (Requirement 22)
   */
  public async completeAndStartNext(
    currentActivityId: string,
    options?: { completionNotes?: string },
    userEmail = 'ops.dispatcher@turkysgroup.co.tz'
  ): Promise<{ completedActivity: VesselActivity; nextStartedActivity?: VesselActivity }> {
    const current = engineState().activities.find((a) => a.id === currentActivityId);
    if (!current) throw new Error(`Activity ${currentActivityId} not found`);

    const { activity: completed, nextReadyActivities } = await this.completeActivity(
      currentActivityId,
      options,
      userEmail
    );

    // Find the next eligible primary activity
    const nextPrimary = engineState().activities
      .filter((a) => a.vesselId === current.vesselId && a.id !== current.id && a.executionMode === 'PRIMARY')
      .filter((a) => a.status === 'READY' || (a.status === 'PLANNED' && a.sequenceNo > current.sequenceNo))
      .sort((a, b) => a.sequenceNo - b.sequenceNo)[0];

    let nextStarted: VesselActivity | undefined = undefined;
    if (nextPrimary) {
      const res = await this.startActivity(nextPrimary.id, { startedAt: new Date().toISOString() }, userEmail);
      nextStarted = res.activity;
    }

    return { completedActivity: completed, nextStartedActivity: nextStarted };
  }

  /**
   * REORDER / MOVE ACTIVITY (Requirement 23)
   */
  public async moveActivity(
    activityId: string,
    direction: 'UP' | 'DOWN',
    userEmail = 'ops.dispatcher@turkysgroup.co.tz'
  ): Promise<VesselActivity[]> {
    const act = engineState().activities.find((a) => a.id === activityId);
    if (!act) throw new Error(`Activity ${activityId} not found`);
    if (act.status === 'COMPLETED' || act.status === 'IN_PROGRESS') {
      throw new Error('Cannot reorder completed or in-progress activities.');
    }

    const vesselActs = engineState().activities
      .filter((a) => a.vesselId === act.vesselId && a.status !== 'COMPLETED')
      .sort((a, b) => a.sequenceNo - b.sequenceNo);

    const currentIndex = vesselActs.findIndex((a) => a.id === act.id);
    if (direction === 'UP' && currentIndex > 0) {
      const swapWith = vesselActs[currentIndex - 1];
      const tempSeq = act.sequenceNo;
      act.sequenceNo = swapWith.sequenceNo;
      swapWith.sequenceNo = tempSeq;
    } else if (direction === 'DOWN' && currentIndex < vesselActs.length - 1) {
      const swapWith = vesselActs[currentIndex + 1];
      const tempSeq = act.sequenceNo;
      act.sequenceNo = swapWith.sequenceNo;
      swapWith.sequenceNo = tempSeq;
    }

    this.recordEvent({
      activityId: act.id,
      vesselId: act.vesselId,
      voyageId: act.voyageId,
      eventType: 'REORDERED',
      newStatus: act.status,
      notes: `Activity moved ${direction}`,
      performedBy: userEmail,
    });

    return await this.getVesselActivities(act.vesselId);
  }

  /**
   * Update Progress for an activity (e.g. from readings)
   */
  public async updateProgress(activityId: string, progressPct: number, userEmail = 'system'): Promise<VesselActivity> {
    const act = engineState().activities.find((a) => a.id === activityId);
    if (!act) throw new Error(`Activity ${activityId} not found`);

    act.progressPct = Math.min(100, Math.max(0, Math.round(progressPct * 100) / 100));
    act.updatedAt = new Date().toISOString();

    this.recordEvent({
      activityId: act.id,
      vesselId: act.vesselId,
      voyageId: act.voyageId,
      eventType: 'PROGRESS_UPDATED',
      newStatus: act.status,
      notes: `Progress updated to ${act.progressPct}%`,
      performedBy: userEmail,
    });

    return act;
  }

  /**
   * Re-evaluates all dependencies for a vessel
   */
  public async evaluateDependenciesForVessel(vesselId: string): Promise<VesselActivity[]> {
    const vesselActs = engineState().activities.filter((a) => a.vesselId === vesselId);
    const readyActivities: VesselActivity[] = [];

    for (const act of vesselActs) {
      if (act.status === 'COMPLETED' || act.status === 'CANCELLED' || act.status === 'SKIPPED' || act.status === 'IN_PROGRESS' || act.status === 'STOPPED') {
        continue;
      }

      const deps = engineState().dependencies.filter((d) => d.activityId === act.id);
      if (deps.length === 0) {
        if (act.status === 'PLANNED') {
          act.status = 'READY';
          act.blockerReason = undefined;
          readyActivities.push(act);
        }
        continue;
      }

      let allSatisfied = true;
      const blockers: string[] = [];

      for (const dep of deps) {
        const parent = engineState().activities.find((p) => p.id === dep.dependsOnActivityId);
        if (!parent || (parent.status !== 'COMPLETED' && parent.status !== 'SKIPPED')) {
          allSatisfied = false;
          blockers.push(parent?.title || dep.dependsOnActivityId);
        }
      }

      if (allSatisfied) {
        if (act.status === 'BLOCKED' || act.status === 'PLANNED') {
          act.status = 'READY';
          act.blockerReason = undefined;
          readyActivities.push(act);
        }
      } else {
        act.status = 'BLOCKED';
        act.blockerReason = `Blocked by: ${blockers.join(', ')}`;
      }
    }

    return readyActivities;
  }

  /**
   * Synchronize voyage stage with the current primary activity
   */
  private syncVoyageStage(act: VesselActivity): string {
    switch (act.activityType) {
      case 'VIGOR_UNLOADING':
        return 'UNLOADING';
      case 'VIGOR_BERTHING':
        return 'BERTHED_AT_VIGOR';
      case 'WAITING_FOR_VIGOR_BERTH':
        return 'WAITING_FOR_VIGOR_BERTH';
      case 'FUEL':
        return 'FUEL_IN_PROGRESS';
      case 'OUTBOUND_VOYAGE':
        return 'SAILING_TO_MANUFACTURER';
      case 'WAITING_AT_MANUFACTURER':
        return 'WAITING_AT_MANUFACTURER';
      case 'MANUFACTURER_BERTHING':
        return 'MANUFACTURER_BERTH_ASSIGNED';
      case 'MANUFACTURER_LOADING':
        return 'LOADING';
      case 'RETURN_VOYAGE':
        return 'RETURNING_TO_VIGOR';
      case 'MAINTENANCE':
        return 'MAINTENANCE';
      default:
        return 'IN_PROGRESS';
    }
  }

  /**
   * Sync Berth B01 occupancy
   */
  private syncBerthState(act: VesselActivity): void {
    if (act.berthId === 'B01') {
      // Mark occupied
    }
  }

  /**
   * Shift downstream forecast times
   */
  private shiftDownstreamForecasts(fromAct: VesselActivity, delayMinutes: number): void {
    const downstream = engineState().activities.filter(
      (a) => a.vesselId === fromAct.vesselId && a.sequenceNo > fromAct.sequenceNo && a.status !== 'COMPLETED'
    );
    for (const d of downstream) {
      if (d.forecastStart) {
        d.forecastStart = new Date(new Date(d.forecastStart).getTime() + delayMinutes * 60000).toISOString();
      }
      if (d.forecastEnd) {
        d.forecastEnd = new Date(new Date(d.forecastEnd).getTime() + delayMinutes * 60000).toISOString();
      }
    }
  }

  private recordEvent(event: Omit<VesselActivityEvent, 'id' | 'occurredAt'> & { occurredAt?: string }): void {
    const id = `evt-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;
    engineState().events.push({
      ...event,
      id,
      occurredAt: event.occurredAt || new Date().toISOString(),
    });
  }
}


const activityContext = new AsyncLocalStorage<{activities: VesselActivity[]; dependencies: ActivityDependency[]; events: VesselActivityEvent[]}>();
function engineState() {
  return activityContext.getStore() || {activities: demoActivities, dependencies: demoDependencies, events: demoEvents};
}
const engine = new ActivityService();
export const activityService = new Proxy(engine, {
  get(target, key) {
    const method = Reflect.get(target, key);
    if (typeof method !== 'function') return method;
    return (...args: any[]) => {
      if (!dbManager.isUsingMySQL()) return method.apply(target, args);
      const write = !String(key).startsWith('get');
      return withOperationalState(async (state) => {
        const context = { activities: state.activities,
          dependencies: state.activities.flatMap((a: VesselActivity) => a.dependencies || []),
          events: state.activities.flatMap((a: VesselActivity) => a.events || []) };
        return activityContext.run(context, async () => {
          const result = await method.apply(target, args);
          for (const activity of context.activities) {
            activity.dependencies = context.dependencies.filter(d => d.activityId === activity.id);
            activity.events = context.events.filter(e => e.activityId === activity.id);
          }
          const changed = result?.activity;
          if (changed?.voyageId && result.updatedStage) {
            const voyage = state.voyages.find((v: any) => v.id === changed.voyageId);
            if (voyage) voyage.currentStage = result.updatedStage;
          }
          return result;
        });
      }, write);
    };
  },
});
