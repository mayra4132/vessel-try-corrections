import { createHash, randomUUID } from 'node:crypto';
import { PoolConnection } from 'mysql2/promise';
import { dbManager } from './database';
import { calculatePaymentAccountTotals } from '../src/lib/paymentEngine';

type Row = Record<string, any>;
export type OperationalState = Record<string, any>;
export const defaultSettings = {
  postUnloadBerthBufferHours: 1.5, arrivalOverdueGraceMinutes: 30,
  paymentWarningThresholdHours: 48, manufacturerEligibilityPercent: 100,
  defaultSailingSpeedKnots: 10, defaultLoadingRateTph: 500,
  defaultUnloadingRateTph: 600, unloadingRateUnitPreference: 'TPH',
};
const tables: Record<string, string> = {
  vessels: 'vessels', berths: 'berths', voyages: 'voyages',
  paymentAccounts: 'payment_accounts', paymentTransactions: 'payment_transactions',
  fuelOperations: 'fuel_operations', manufacturerQueue: 'manufacturer_queue_entries',
  operationalReadings: 'operational_readings', delayEvents: 'delay_events', activities: 'vessel_activities',
};
const aliases: Record<string, Record<string, string>> = {
  vessels: { imo_reference: 'imo' },
  berths: { lifecycle_status: 'status', status: 'operationalStatus', maximum_vessel_size_t: 'maximumVesselSize', default_unloading_rate_tph: 'defaultUnloadingRate' },
  operational_readings: { recorded_at: 'timestamp', unloaded_t: 'unloadedTonnes' },
  delay_events: { start_time: 'start', end_time: 'end', responsible_area: 'area' },
};
const camel = (key: string) => key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
const metadata = new Map<string, any[]>();
async function columns(c: PoolConnection, table: string) {
  if (!metadata.has(table)) {
    const [rows] = await c.query(`SHOW COLUMNS FROM \`${table}\``);
    metadata.set(table, rows as any[]);
  }
  return metadata.get(table)!;
}
const property = (table: string, column: string) => aliases[table]?.[column] || camel(column);
const json = (value: any) => typeof value === 'string' ? JSON.parse(value) : value;
function sqlDate(value: any) {
  if (value == null || value === '') return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error(`Invalid date: ${value}`);
  return date.toISOString().slice(0, 19).replace('T', ' ');
}
export class StateConflict extends Error {
  status = 409;
  constructor(public revision: number) { super('Operations changed on the server. Refresh before editing again.'); }
}
export async function readRows(c: PoolConnection, table: string, extras: Row[] = []): Promise<Row[]> {
  const [rows] = await c.query(`SELECT * FROM \`${table}\``);
  const fields = await columns(c, table);
  return (rows as Row[]).map(row => {
    const result: Row = { ...extras.find(item => item.id === row.id) };
    for (const field of fields) {
      let value = row[field.Field];
      if (value !== null && /^(datetime|timestamp)/i.test(field.Type)) value = String(value).replace(' ', 'T') + 'Z';
      else if (value !== null && /^(decimal|float|double|int|bigint)/i.test(field.Type)) value = Number(value);
      else if (value !== null && /^tinyint\(1\)/i.test(field.Type)) value = Boolean(value);
      result[property(table, field.Field)] = value ?? undefined;
    }
    return result;
  });
}
export async function upsert(c: PoolConnection, table: string, item: Row) {
  const fields = await columns(c, table);
  const names: string[] = [], values: any[] = [];
  for (const field of fields) {
    const key = property(table, field.Field);
    if (!Object.prototype.hasOwnProperty.call(item, key)) continue;
    let value = item[key];
    if (value === undefined) value = null;
    if (/^(datetime|timestamp)/i.test(field.Type)) value = sqlDate(value);
    if (typeof value === 'object' && value !== null) value = JSON.stringify(value);
    names.push(field.Field); values.push(value);
  }
  if (!names.includes('id')) throw new Error(`Missing id for ${table}`);
  const updates = names.filter(name => name !== 'id').map(name => `\`${name}\`=VALUES(\`${name}\`)`);
  await c.query(`INSERT INTO \`${table}\` (${names.map(n => `\`${n}\``).join(',')}) VALUES (${names.map(() => '?').join(',')}) ON DUPLICATE KEY UPDATE ${updates.join(',') || 'id=id'}`, values);
}

async function load(c: PoolConnection, extra: OperationalState): Promise<OperationalState> {
  const state: OperationalState = {};
  for (const [key, table] of Object.entries(tables)) state[key] = await readRows(c, table, extra[key] || []);
  const manufacturers = await readRows(c, 'manufacturers');
  const suppliers = await readRows(c, 'fuel_suppliers');
  const visits = await readRows(c, 'vessel_visits');
  for (const voyage of state.voyages) {
    const visit = visits.find(v => v.voyageId === voyage.id);
    Object.assign(voyage, {
      vesselName: state.vessels.find((v: Row) => v.id === voyage.vesselId)?.name || '',
      manufacturerName: manufacturers.find(v => v.id === voyage.manufacturerId)?.name || '',
      predictedAnchorageWaitHours: (voyage.predictedAnchorageWaitMinutes || 0) / 60,
    });
    if (visit) Object.assign(voyage, {
      visitId: visit.id, unloadedTonnes: visit.unloadedT, unloadingRateTph: visit.unloadingRateTph,
      plannedUnloadStart: visit.plannedArrival, actualUnloadStart: visit.unloadStart,
      actualUnloadEnd: visit.unloadEnd, forecastUnloadEnd: visit.forecastUnloadEnd,
      expectedBerthRelease: visit.expectedBerthRelease, postUnloadBufferHours: visit.postUnloadingMinutes / 60,
    });
  }
  for (const fuel of state.fuelOperations) fuel.supplierName = suppliers.find(s => s.id === fuel.supplierId)?.name || '';
  for (const entry of state.manufacturerQueue) {
    entry.manufacturerName = manufacturers.find(m => m.id === entry.manufacturerId)?.name || '';
    entry.vesselName = state.vessels.find((v: Row) => v.id === entry.vesselId)?.name || entry.externalVesselName || '';
  }
  for (const reading of state.operationalReadings) {
    const visit = visits.find(v => v.id === reading.visitId);
    reading.voyageId = visit?.voyageId; reading.vesselId = visit?.vesselId;
    reading.source = reading.source === 'CSV' ? 'Spreadsheet Import' : reading.source === 'MANUAL' ? 'Manual' : 'Calculated';
    reading.remainingTonnes = Math.max(0, (visit?.cargoTotalT || 0) - reading.unloadedTonnes);
    reading.dataQuality = reading.dataQuality || 'CURRENT';
  }
  const deps = await readRows(c, 'activity_dependencies');
  const events = await readRows(c, 'vessel_activity_events');
  for (const activity of state.activities) {
    activity.dependencies = deps.filter(d => d.activityId === activity.id);
    activity.events = events.filter(e => e.activityId === activity.id);
  }
  const [settings] = await c.query('SELECT setting_key, setting_value FROM system_settings');
  state.systemSettings = { ...defaultSettings };
  for (const setting of settings as Row[]) {
    try { state.systemSettings[setting.setting_key] = json(setting.setting_value); }
    catch { state.systemSettings[setting.setting_key] = setting.setting_value; }
  }
  return state;
}

async function save(c: PoolConnection, state: OperationalState, previous: OperationalState) {
  for (const key of Object.keys(tables)) {
    if (!Array.isArray(state[key])) throw new Error(`${key} must be an array`);
    if (new Set(state[key].map((r: Row) => r.id)).size !== state[key].length) throw new Error(`Duplicate ${key} id`);
  }
  // Parents are written before their children; a failed constraint rolls back the entire update.
  for (const vessel of state.vessels) await upsert(c, 'vessels', vessel);
  for (const berth of state.berths) await upsert(c, 'berths', berth);
  const visitIds = new Map<string, string>();
  const existingVisits = await readRows(c, 'vessel_visits');
  for (const voyage of state.voyages) {
    if (voyage.manufacturerId) await upsert(c, 'manufacturers', { id: voyage.manufacturerId, name: voyage.manufacturerName || voyage.manufacturerId });
    await upsert(c, 'voyages', { ...voyage, predictedAnchorageWaitMinutes: Math.round((voyage.predictedAnchorageWaitHours || 0) * 60) });
    const visitId = existingVisits.find(v => v.voyageId === voyage.id)?.id || randomUUID();
    visitIds.set(voyage.id, visitId);
    await upsert(c, 'vessel_visits', {
      id: visitId, vesselId: voyage.vesselId, voyageId: voyage.id, berthId: voyage.assignedBerthId || null,
      voyageNumber: voyage.voyageNumber, cargoType: voyage.cargoType,
      cargoTotalT: voyage.actualCargoT || voyage.plannedCargoT, unloadedT: voyage.unloadedTonnes || 0,
      unloadingRateTph: voyage.unloadingRateTph, plannedArrival: voyage.plannedUnloadStart,
      unloadStart: voyage.actualUnloadStart, unloadEnd: voyage.actualUnloadEnd,
      forecastUnloadEnd: voyage.forecastUnloadEnd, expectedBerthRelease: voyage.expectedBerthRelease,
      postUnloadingMinutes: Math.round((voyage.postUnloadBufferHours ?? 1.5) * 60),
      status: voyage.actualUnloadEnd ? 'COMPLETED' : voyage.currentStage === 'UNLOADING' ? 'UNLOADING' : 'PLANNED',
    });
  }
  for (const account of state.paymentAccounts) await upsert(c, 'payment_accounts', account);
  for (const transaction of state.paymentTransactions) {
    const old = previous.paymentTransactions.find((t: Row) => t.id === transaction.id);
    if (old) {
      for (const key of ['amount','currency','paymentAccountId','vesselId','voyageId','category','transactionDate','referenceNumber']) {
        if ((key === 'transactionDate' ? sqlDate(old[key]) : String(old[key] ?? '')) !== (key === 'transactionDate' ? sqlDate(transaction[key]) : String(transaction[key] ?? ''))) throw new Error('Posted payments cannot be edited; use a reversal.');
      }
    } else await upsert(c, 'payment_transactions', { ...transaction, status: 'POSTED' });
  }
  for (const account of state.paymentAccounts) {
    const totals = calculatePaymentAccountTotals(account, state.paymentTransactions.filter((t: Row) => !t.status || t.status === 'POSTED'));
    Object.assign(account, { isEligible: totals.isEligible, status: totals.remaining === 0 ? 'PAID' : totals.totalPaid > 0 ? 'PARTIALLY_PAID' : 'PENDING' });
    await upsert(c, 'payment_accounts', account);
  }
  for (const fuel of state.fuelOperations) {
    if (fuel.supplierId) await upsert(c, 'fuel_suppliers', { id: fuel.supplierId, name: fuel.supplierName || fuel.supplierId });
    await upsert(c, 'fuel_operations', fuel);
  }
  for (const entry of state.manufacturerQueue) {
    const manufacturerId = entry.manufacturerId || state.voyages.find((v: Row) => v.id === entry.voyageId)?.manufacturerId;
    const [found] = await c.query('SELECT id FROM manufacturers WHERE name=? LIMIT 1', [entry.manufacturerName]);
    const id = manufacturerId || (found as Row[])[0]?.id || 'mfr-' + createHash('sha256').update(entry.manufacturerName || '').digest('hex').slice(0,24);
    if (!entry.manufacturerName) throw new Error('Manufacturer name is required');
    await upsert(c, 'manufacturers', {id, name:entry.manufacturerName});
    await upsert(c, 'manufacturer_queue_entries', { ...entry, manufacturerId: id, externalVesselName: entry.isExternal ? entry.vesselName : null });
  }
  for (const reading of state.operationalReadings) await upsert(c, 'operational_readings', {
    ...reading, visitId: reading.visitId || visitIds.get(reading.voyageId),
    source: reading.source === 'Spreadsheet Import' ? 'CSV' : reading.source === 'Calculated' ? 'DEMO' : 'MANUAL',
  });
  for (const delay of state.delayEvents) await upsert(c, 'delay_events', { ...delay, visitId: delay.visitId || visitIds.get(delay.voyageId), cause: delay.cause || delay.description });
  for (const activity of state.activities) await upsert(c, 'vessel_activities', {
    ...activity, visitId: activity.visitId === activity.voyageId ? visitIds.get(activity.voyageId) : activity.visitId,
  });
  for (const activity of state.activities) {
    for (const dep of activity.dependencies || []) await upsert(c, 'activity_dependencies', dep);
    for (const event of activity.events || []) await upsert(c, 'vessel_activity_events', event);
  }
  // Respect foreign keys rather than silently discarding related operational history.
  for (const [key, table] of Object.entries(tables).reverse()) {
    const removed = previous[key].filter((old: Row) => !state[key].some((row: Row) => row.id === old.id));
    if (key === 'paymentTransactions' && removed.length) throw new Error('Posted payments cannot be deleted; use a reversal.');
    for (const row of removed) await c.query(`DELETE FROM \`${table}\` WHERE id=?`, [row.id]);
  }
  for (const [key, value] of Object.entries(state.systemSettings || {})) await c.query(
    'INSERT INTO system_settings (setting_key,setting_value) VALUES (?,?) ON DUPLICATE KEY UPDATE setting_value=VALUES(setting_value)',
    [key, JSON.stringify(value)],
  );
}

// Stable content fingerprint detects imports and SQL edits that bypass the API.
function fingerprint(state: OperationalState): string {
  const canonical = (value: any): any => {
    if (Array.isArray(value)) return value.map(canonical).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
    if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().filter(k=>value[k]!==undefined).map(k=>[k,canonical(value[k])]));
    return value;
  };
  return createHash('sha256').update(JSON.stringify(canonical(state))).digest('hex');
}

export async function withOperationalState<T>(fn: (state: OperationalState, revision: number, c: PoolConnection) => Promise<T>, write = false, expectedRevision?: number) {
  const pool = dbManager.getPool();
  if (!pool) throw new Error('Database is not configured');
  const c = await pool.getConnection();
  try {
    await c.query("SET time_zone = '+00:00'");
    // Initialize outside the transaction: INSERT IGNORE can acquire a shared lock,
    // and upgrading two concurrent shared locks to FOR UPDATE can deadlock.
    await c.query("INSERT IGNORE INTO operational_state_snapshots (id,revision,state_json) VALUES (1,0,'{}')");
    await c.beginTransaction();
    const [rows] = await c.query('SELECT revision,state_json,updated_at FROM operational_state_snapshots WHERE id=1 FOR UPDATE');
    const current = (rows as Row[])[0];
    let revision = Number(current.revision);
    const extra = json(current.state_json);
    const state = await load(c, extra);
    const observed = fingerprint(state);
    if (extra.__databaseFingerprint !== observed) {
      if (extra.__databaseFingerprint) revision++;
      await c.query('UPDATE operational_state_snapshots SET revision=?,state_json=?,updated_at=UTC_TIMESTAMP() WHERE id=1', [revision,JSON.stringify({...state,__databaseFingerprint:observed})]);
    }
    if (expectedRevision !== undefined && expectedRevision !== revision) {
      await c.commit();
      throw new StateConflict(revision);
    }
    const previous = structuredClone(state);
    const result = await fn(state, revision, c);
    if (write) {
      await save(c, state, previous);
      await c.query('UPDATE operational_state_snapshots SET revision=?,state_json=?,updated_at=UTC_TIMESTAMP() WHERE id=1', [revision + 1, JSON.stringify({...state,__databaseFingerprint:fingerprint(await load(c,state))})]);
    }
    await c.commit();
    return result;
  } catch (error) { await c.rollback(); throw error; }
  finally { c.release(); }
}

export function getOperationalState() {
  return withOperationalState(async (state, revision) => ({ state, revision, updated_at: new Date().toISOString() }));
}
export function putOperationalState(input: OperationalState, revision: number) {
  return withOperationalState(async (state, current) => {
    for (const key of Object.keys(tables)) if (Object.prototype.hasOwnProperty.call(input, key)) state[key] = input[key];
    if (input.systemSettings) state.systemSettings = input.systemSettings;
    return { state, revision: current + 1, updated_at: new Date().toISOString() };
  }, true, revision);
}
