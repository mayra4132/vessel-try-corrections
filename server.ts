import { databaseRouter } from './server/databaseRouter';
import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import { dbManager } from './server/database';
import {
  performSemanticSearch,
  buildGroundedOperationalSnapshot,
  generateFactualAnalystResponse,
  SYSTEM_ROUTES,
  AssistantAnalysisResult,
} from './server/semanticKnowledge';
import {
  authenticate,
  registerUser,
  listAllUsers,
  updateUserStatus,
  updateUserRole,
  verifyToken,
  logActivity,
  getActivityLogs,
  validateCompanyDomain,
  UserRole,
} from './server/auth';
import { activityService } from './server/services/activityService';

const app = express();
const PORT = Number(process.env.PORT || 3000);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// CORS headers for all API requests
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }
  next();
});

// ---------------------------------------------------------------------------
// In-Memory Data Store (Replicating PostgreSQL database)
// ---------------------------------------------------------------------------

interface VesselRecord {
  id: string;
  name: string;
  imo_reference: string | null;
  capacity_t: number | null;
  agent_name: string | null;
  agent_phone: string | null;
  created_at: string;
  updated_at: string;
}

interface BerthRecord {
  id: string;
  name: string;
  status: 'AVAILABLE' | 'OCCUPIED' | 'MAINTENANCE';
  created_at: string;
  updated_at: string;
}

interface VisitRecord {
  id: string;
  vessel_id: string;
  berth_id: string;
  cargo_type: string;
  cargo_total_t: number;
  planned_arrival: string;
  actual_arrival: string | null;
  unload_start: string | null;
  unload_end: string | null;
  planned_departure: string | null;
  actual_departure: string | null;
  post_unloading_minutes: number;
  status: 'PLANNED' | 'ARRIVED' | 'UNLOADING' | 'COMPLETED' | 'DEPARTED' | 'CANCELLED';
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface ReadingRecord {
  id: string;
  visit_id: string;
  recorded_at: string;
  source: 'MANUAL' | 'CSV' | 'DEMO';
  unloaded_t: number;
  observed_rate_tph: number | null;
  buffer_level_t: number | null;
  buffer_capacity_t: number | null;
  packaging_rate_tph: number | null;
  unloading_status: 'ACTIVE' | 'STOPPED' | 'COMPLETED';
  packaging_status: 'ACTIVE' | 'STOPPED' | 'NOT_APPLICABLE';
  notes: string | null;
  created_at: string;
}

interface DelayRecord {
  id: string;
  visit_id: string;
  start_time: string;
  end_time: string | null;
  category: string;
  cause: string;
  responsible_area: string;
  equipment: string | null;
  description: string | null;
  created_at: string;
}

interface UpcomingCallRecord {
  id: string;
  vessel_id: string;
  berth_id: string;
  expected_arrival: string;
  cargo_type: string;
  cargo_quantity_t: number;
  expected_rate_tph: number | null;
  call_alert_at: string | null;
  confirmation_due_at: string | null;
  confirmed_at: string | null;
  berth_preparation_minutes: number | null;
  status: 'PLANNED' | 'CONFIRMED' | 'ARRIVED' | 'CANCELLED';
  notes: string | null;
  created_at: string;
  updated_at: string;
}

const now = new Date();
const nowIso = now.toISOString();

// Seed Vessels
const vessels: VesselRecord[] = [
  {
    id: 'v-01',
    name: 'MV VIGOR 01',
    imo_reference: '9482104',
    capacity_t: 10200,
    agent_name: 'Zanzibar Shipping Agency',
    agent_phone: '+255 777 412 890',
    created_at: '2025-01-10T08:00:00Z',
    updated_at: nowIso,
  },
  {
    id: 'v-02',
    name: 'MV VIGOR 02',
    imo_reference: '9531890',
    capacity_t: 10200,
    agent_name: 'Pemba Maritime Services',
    agent_phone: '+255 777 554 112',
    created_at: '2025-01-15T08:00:00Z',
    updated_at: nowIso,
  },
  {
    id: 'v-03',
    name: 'MV VIGOR 03',
    imo_reference: '9618422',
    capacity_t: 9800,
    agent_name: 'Tanga Logistics Ltd',
    agent_phone: '+255 777 908 334',
    created_at: '2025-02-01T08:00:00Z',
    updated_at: nowIso,
  },
  {
    id: 'v-polar-night',
    name: 'Polar Night',
    imo_reference: 'IMO-9428111',
    capacity_t: 13800,
    agent_name: 'Zanzibar Port Agency',
    agent_phone: '+255 777 123 456',
    created_at: '2025-01-01T08:00:00Z',
    updated_at: nowIso,
  },
  {
    id: 'v-tumaini',
    name: 'MV Tumaini',
    imo_reference: 'IMO-DEMO-001',
    capacity_t: 12500,
    agent_name: 'Zanzibar Shipping Agency',
    agent_phone: '+255700000001',
    created_at: '2025-01-01T08:00:00Z',
    updated_at: nowIso,
  },
];

// Seed Berths
const berths: BerthRecord[] = [
  {
    id: 'B01',
    name: 'Berth B01 — VIGOR Dedicated',
    status: 'OCCUPIED',
    created_at: '2025-01-01T08:00:00Z',
    updated_at: nowIso,
  },
  {
    id: 'B02',
    name: 'Berth B02 — Malindi Wharf Secondary',
    status: 'AVAILABLE',
    created_at: '2025-01-01T08:00:00Z',
    updated_at: nowIso,
  },
  {
    id: 'B-MANGAPWANI',
    name: 'Mangapwani — Berth 1',
    status: 'AVAILABLE',
    created_at: '2025-01-01T08:00:00Z',
    updated_at: nowIso,
  },
];

// Seed Visits
const visits: VisitRecord[] = [
  {
    id: 'voy-01',
    vessel_id: 'v-01',
    berth_id: 'B01',
    cargo_type: 'Bulk Cement',
    cargo_total_t: 10500,
    planned_arrival: new Date(now.getTime() - 14 * 3600000).toISOString(),
    actual_arrival: new Date(now.getTime() - 12 * 3600000).toISOString(),
    unload_start: new Date(now.getTime() - 10 * 3600000).toISOString(),
    unload_end: null,
    planned_departure: new Date(now.getTime() + 6 * 3600000).toISOString(),
    actual_departure: null,
    post_unloading_minutes: 90,
    status: 'UNLOADING',
    notes: 'Active pneumatic self-discharge into Silo 1 & 2 via 10-inch pipeline.',
    created_at: '2025-02-10T08:00:00Z',
    updated_at: nowIso,
  },
];

// Seed Readings
const readings: ReadingRecord[] = [
  {
    id: 'rd-01',
    visit_id: 'voy-01',
    recorded_at: new Date(now.getTime() - 2 * 3600000).toISOString(),
    source: 'DEMO',
    unloaded_t: 6350,
    observed_rate_tph: 590,
    buffer_level_t: 790,
    buffer_capacity_t: 1200,
    packaging_rate_tph: 560,
    unloading_status: 'ACTIVE',
    packaging_status: 'ACTIVE',
    notes: 'Nominal discharge flow across both lines.',
    created_at: new Date(now.getTime() - 2 * 3600000).toISOString(),
  },
  {
    id: 'rd-02',
    visit_id: 'voy-01',
    recorded_at: new Date(now.getTime() - 3600000).toISOString(),
    source: 'DEMO',
    unloaded_t: 6950,
    observed_rate_tph: 600,
    buffer_level_t: 810,
    buffer_capacity_t: 1200,
    packaging_rate_tph: 565,
    unloading_status: 'ACTIVE',
    packaging_status: 'ACTIVE',
    notes: 'Line pressure stabilized at 2.4 bar.',
    created_at: new Date(now.getTime() - 3600000).toISOString(),
  },
  {
    id: 'rd-03',
    visit_id: 'voy-01',
    recorded_at: nowIso,
    source: 'MANUAL',
    unloaded_t: 7560,
    observed_rate_tph: 605,
    buffer_level_t: 820,
    buffer_capacity_t: 1200,
    packaging_rate_tph: 570,
    unloading_status: 'ACTIVE',
    packaging_status: 'ACTIVE',
    notes: 'Pneumatic line 1 and 2 running at 605 t/h.',
    created_at: nowIso,
  },
];

// Seed Delays
const delays: DelayRecord[] = [
  {
    id: 'del-01',
    visit_id: 'voy-01',
    start_time: new Date(now.getTime() - 7 * 3600000).toISOString(),
    end_time: new Date(now.getTime() - 6.2 * 3600000).toISOString(),
    category: 'TECHNICAL',
    cause: 'Pneumatic compressor valve gasket replacement on Silo Manifold B',
    responsible_area: 'Terminal Silo Ops',
    equipment: 'Manifold B Valve #3',
    description: 'Minor gasket leak isolated and replaced within 48 minutes.',
    created_at: new Date(now.getTime() - 7 * 3600000).toISOString(),
  },
];

// Seed Upcoming Calls
const upcomingCalls: UpcomingCallRecord[] = [
  {
    id: 'call-01',
    vessel_id: 'v-03',
    berth_id: 'B01',
    expected_arrival: new Date(now.getTime() + 4 * 3600000).toISOString(),
    cargo_type: 'Bulk Cement',
    cargo_quantity_t: 9800,
    expected_rate_tph: 580,
    call_alert_at: new Date(now.getTime() - 2 * 3600000).toISOString(),
    confirmation_due_at: new Date(now.getTime() + 2 * 3600000).toISOString(),
    confirmed_at: null,
    berth_preparation_minutes: 60,
    status: 'PLANNED',
    notes: 'MV VIGOR 03 returning laden from Tanga Cement factory.',
    created_at: '2025-02-12T08:00:00Z',
    updated_at: nowIso,
  },
];

// Operations State (envelope for frontend multi-module synchronization)
let operationalStatePayload: Record<string, unknown> | null = null;
let operationalStateRevision = 1;
let operationalStateUpdatedAt = nowIso;

// ---------------------------------------------------------------------------
// Helpers: Predictions & Dashboard
// ---------------------------------------------------------------------------

function computePredictionForVisit(visit: VisitRecord, latestReading?: ReadingRecord) {
  const cargoTotal = visit.cargo_total_t || 10500;
  const unloaded = latestReading ? latestReading.unloaded_t : 0;
  const remaining = Math.max(0, cargoTotal - unloaded);
  const progress = Math.min(100, Math.round((unloaded / cargoTotal) * 1000) / 10);
  const effectiveRate = latestReading?.observed_rate_tph || 600;

  const hoursRemaining = effectiveRate > 0 ? remaining / effectiveRate : 0;
  const finishTime = new Date(Date.now() + hoursRemaining * 3600000);
  const releaseTime = new Date(finishTime.getTime() + (visit.post_unloading_minutes || 90) * 60000);

  return {
    id: `pred-${Date.now()}`,
    visit_id: visit.id,
    generated_at: new Date().toISOString(),
    remaining_t: remaining,
    progress_pct: progress,
    effective_rate_tph: effectiveRate,
    estimated_unload_finish: finishTime.toISOString(),
    expected_berth_release: releaseTime.toISOString(),
    method: 'RateExtrapolationWithLinePurgeBuffer',
    data_quality: 'VALID' as const,
    created_at: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// API v1 Routes
// ---------------------------------------------------------------------------

const apiRouter = express.Router();

// Authentication middleware to populate req.user if Bearer token is provided
apiRouter.use((req: Request, res: Response, next: NextFunction) => {
  const token = req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : undefined;
  const decoded = token ? verifyToken(token) : null;
  if (!decoded) { next(); return; }
  if (!dbManager.isUsingMySQL()) { (req as any).user = decoded; next(); return; }
  dbManager.executeQuery<any>('SELECT email,role,status FROM users WHERE id=? LIMIT 1',[decoded.uid]).then(rows=>{
    const user=rows[0];
    if (!user || user.status !== 'Active') {res.status(401).json({error:'Account is no longer active. Please sign in again.'});return;}
    (req as any).user={...decoded,email:user.email,role:user.role};next();
  }).catch(()=>res.status(503).json({error:'Authentication database unavailable.'}));
});

apiRouter.use(databaseRouter);

// Helper auth guards
function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!(req as any).user) {
    res.status(401).json({ error: 'Authentication required. Please sign in with your @turkysgroup.co.tz account.' });
    return;
  }
  next();
}

function requireRole(allowedRoles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = (req as any).user;
    if (!user) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }
    if (!allowedRoles.includes(user.role)) {
      res.status(403).json({ error: `Access denied. Role ${user.role} does not have required permissions.` });
      return;
    }
    next();
  };
}

// ---------------------------------------------------------------------------
// Authentication & User Management Routes
// ---------------------------------------------------------------------------

// POST /api/v1/auth/login
apiRouter.post('/auth/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required.' });
      return;
    }

    if (!validateCompanyDomain(email)) {
      res.status(403).json({
        error: 'Corporate Access Policy: Only authorized accounts under @turkysgroup.co.tz are permitted.',
      });
      return;
    }

    const result = await authenticate(email, password);
    res.json(result);
  } catch (err: any) {
    res.status(401).json({ error: err.message || 'Authentication failed.' });
  }
});

// POST /api/v1/auth/register
apiRouter.post('/auth/register', async (req: Request, res: Response) => {
  try {
    const { email, password, fullName, department, requestedRole } = req.body;
    if (!email || !password || !fullName) {
      res.status(400).json({ error: 'Full name, email, and password are required.' });
      return;
    }

    if (!validateCompanyDomain(email)) {
      res.status(403).json({
        error: 'Corporate Registration Policy: Registrations must use official @turkysgroup.co.tz company emails.',
      });
      return;
    }

    const user = await registerUser(email, password, fullName, department, requestedRole);
    res.status(201).json({
      message: 'Account registered successfully. It is now awaiting System Administrator activation.',
      user,
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Registration failed.' });
  }
});

// GET /api/v1/auth/me
apiRouter.get('/auth/me', requireAuth, (req: Request, res: Response) => {
  res.json({ user: (req as any).user });
});

// POST /api/v1/auth/logout
apiRouter.post('/auth/logout', (req: Request, res: Response) => {
  const user = (req as any).user;
  if (user?.email) {
    logActivity(user.email, 'LOGOUT', 'USER', user.uid, 'User logged out.');
  }
  res.json({ success: true, message: 'Logged out successfully.' });
});

// GET /api/v1/users (Admin only)
apiRouter.get('/users', requireRole(['Admin']), async (req: Request, res: Response) => {
  try {
    const users = await listAllUsers();
    res.json(users);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to list users.' });
  }
});

// PUT /api/v1/users/:id/status (Admin only)
apiRouter.put('/users/:id/status', requireRole(['Admin']), async (req: Request, res: Response) => {
  try {
    const { status } = req.body;
    if (!['Active', 'Disabled', 'Pending'].includes(status)) {
      res.status(400).json({ error: 'Invalid status. Must be Active, Disabled, or Pending.' });
      return;
    }
    const adminEmail = (req as any).user.email;
    const updated = await updateUserStatus(req.params.id, status, adminEmail);
    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to update user status.' });
  }
});

// PUT /api/v1/users/:id/role (Admin only)
apiRouter.put('/users/:id/role', requireRole(['Admin']), async (req: Request, res: Response) => {
  try {
    const { role } = req.body;
    if (!['Admin', 'Management', 'Operations', 'Viewer'].includes(role)) {
      res.status(400).json({ error: 'Invalid role. Must be Admin, Management, Operations, or Viewer.' });
      return;
    }
    const adminEmail = (req as any).user.email;
    const updated = await updateUserRole(req.params.id, role, adminEmail);
    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to update user role.' });
  }
});

// GET /api/v1/activity-logs (Admin & Operations)
apiRouter.get('/activity-logs', requireRole(['Admin', 'Operations', 'Management']), async (req: Request, res: Response) => {
  try { res.json(await getActivityLogs()); } catch { res.status(503).json({error:'Audit database unavailable'}); }
});

// ---------------------------------------------------------------------------
// Health & Infrastructure
// ---------------------------------------------------------------------------

// 1. Health
apiRouter.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    service: 'port-monitoring-api',
    domainEnforced: '@turkysgroup.co.tz',
    version: '2.4-production',
  });
});

apiRouter.get('/health/database', async (req: Request, res: Response) => {
  try {
    const dbStatus = await dbManager.checkHealth();
    res.json({
      status: 'healthy',
      database: dbStatus.connected ? 'connected' : 'fallback_mode',
      provider: dbStatus.provider,
      host: dbStatus.host,
      databaseName: dbStatus.database,
      user: dbStatus.user,
      message: dbStatus.message,
      lastChecked: dbStatus.lastChecked,
    });
  } catch (err: any) {
    res.status(500).json({
      status: 'error',
      database: 'error',
      error: err.message,
    });
  }
});

// POST /api/v1/database/test
apiRouter.post('/database/test', async (req: Request, res: Response) => {
  const status = await dbManager.checkHealth();
  res.json(status);
});

// 2. Operational State Persistence
apiRouter.get('/operations/state', (req: Request, res: Response) => {
  res.json({
    state: operationalStatePayload,
    revision: operationalStateRevision,
    updated_at: operationalStateUpdatedAt,
  });
});

apiRouter.put('/operations/state', (req: Request, res: Response) => {
  const { state, expected_revision } = req.body;

  if (
    expected_revision !== undefined &&
    expected_revision !== null &&
    expected_revision !== 0 &&
    expected_revision !== operationalStateRevision
  ) {
    res.status(409).json({
      detail: {
        message: 'Operational state changed on another client.',
        current_revision: operationalStateRevision,
      },
    });
    return;
  }

  operationalStatePayload = state || {};
  operationalStateRevision += 1;
  operationalStateUpdatedAt = new Date().toISOString();

  res.json({
    state: operationalStatePayload,
    revision: operationalStateRevision,
    updated_at: operationalStateUpdatedAt,
  });
});

// 3. Active Dashboard
apiRouter.get('/dashboard/active', (req: Request, res: Response) => {
  const activeVisit = visits.find((v) => v.status === 'UNLOADING') || visits[0];
  const visitReadings = readings.filter((r) => r.visit_id === activeVisit.id);
  const latestReading = visitReadings[visitReadings.length - 1];
  const pred = computePredictionForVisit(activeVisit, latestReading);

  const bufferLevel = latestReading?.buffer_level_t || 820;
  const bufferCap = latestReading?.buffer_capacity_t || 1200;
  const bufferPct = Math.round((bufferLevel / bufferCap) * 1000) / 10;
  const unloadRate = latestReading?.observed_rate_tph || 605;
  const packRate = latestReading?.packaging_rate_tph || 570;
  const netFlow = unloadRate - packRate;

  const nextCall = upcomingCalls[0];
  const nextArrival = nextCall?.expected_arrival || new Date(Date.now() + 4 * 3600000).toISOString();
  const berthRelease = pred.expected_berth_release;
  const hasConflict = new Date(nextArrival).getTime() < new Date(berthRelease).getTime();
  const gapMinutes = Math.round((new Date(nextArrival).getTime() - new Date(berthRelease).getTime()) / 60000);

  res.json({
    visit_id: activeVisit.id,
    vessel_name: 'MV VIGOR 01',
    berth_name: 'Berth B01 — VIGOR Dedicated',
    cargo_type: activeVisit.cargo_type,
    cargo_total_t: activeVisit.cargo_total_t,
    visit_status: activeVisit.status,
    recorded_at: latestReading?.recorded_at || new Date().toISOString(),
    unloaded_t: latestReading?.unloaded_t || 7560,
    remaining_t: pred.remaining_t,
    progress_pct: pred.progress_pct,
    unloading_rate_tph: unloadRate,
    unloading_status: latestReading?.unloading_status || 'ACTIVE',
    buffer_level_t: bufferLevel,
    buffer_capacity_t: bufferCap,
    buffer_percentage: bufferPct,
    buffer_risk_level: bufferPct > 85 ? 'HIGH' : bufferPct > 75 ? 'ELEVATED' : 'NOMINAL',
    buffer_risk_type: netFlow > 50 ? 'ACCUMULATING' : 'BALANCED',
    buffer_net_flow_tph: netFlow,
    buffer_hours_to_full: netFlow > 0 ? Math.round(((bufferCap - bufferLevel) / netFlow) * 10) / 10 : null,
    buffer_hours_to_empty: null,
    buffer_recommended_action:
      hasConflict
        ? 'Eco-steaming recommended for MV VIGOR 03 to sync arrival after B01 line purge.'
        : 'Maintain pneumatic line discharge balance.',
    buffer_message: 'Silo buffer operating within standard parameters.',
    packaging_rate_tph: packRate,
    packaging_status: latestReading?.packaging_status || 'ACTIVE',
    estimated_unload_finish: pred.estimated_unload_finish,
    expected_berth_release: pred.expected_berth_release,
    data_quality: pred.data_quality,
    next_vessel_arrival: nextArrival,
    berth_conflict: hasConflict,
    berth_risk_level: hasConflict ? 'HIGH' : 'LOW',
    berth_gap_minutes: gapMinutes,
    berth_message: hasConflict
      ? 'MV VIGOR 03 arrival precedes expected B01 release by ' + Math.abs(gapMinutes) + ' min.'
      : 'Berth clearance synchronized with incoming voyage.',
  });
});

// 4. Vessels
apiRouter.get('/vessels', (req: Request, res: Response) => {
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 50));
  const offset = Math.max(0, parseInt(req.query.offset as string) || 0);
  res.json(vessels.slice(offset, offset + limit));
});

apiRouter.post('/vessels', (req: Request, res: Response) => {
  const { name, imo_reference, capacity_t, agent_name, agent_phone } = req.body;
  if (!name) {
    res.status(422).json({ detail: 'Vessel name is required.' });
    return;
  }
  const newVessel: VesselRecord = {
    id: `v-${Date.now().toString().slice(-4)}`,
    name,
    imo_reference: imo_reference || null,
    capacity_t: capacity_t ? Number(capacity_t) : null,
    agent_name: agent_name || null,
    agent_phone: agent_phone || null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  vessels.push(newVessel);
  res.status(201).json(newVessel);
});

apiRouter.get('/vessels/:id', (req: Request, res: Response) => {
  const vessel = vessels.find((v) => v.id === req.params.id);
  if (!vessel) {
    res.status(404).json({ detail: 'Vessel not found.' });
    return;
  }
  res.json(vessel);
});

apiRouter.patch('/vessels/:id', (req: Request, res: Response) => {
  const vessel = vessels.find((v) => v.id === req.params.id);
  if (!vessel) {
    res.status(404).json({ detail: 'Vessel not found.' });
    return;
  }
  const { name, imo_reference, capacity_t, agent_name, agent_phone } = req.body;
  if (name !== undefined) vessel.name = name;
  if (imo_reference !== undefined) vessel.imo_reference = imo_reference;
  if (capacity_t !== undefined) vessel.capacity_t = Number(capacity_t);
  if (agent_name !== undefined) vessel.agent_name = agent_name;
  if (agent_phone !== undefined) vessel.agent_phone = agent_phone;
  vessel.updated_at = new Date().toISOString();
  res.json(vessel);
});

// 5. Berths
apiRouter.get('/berths', (req: Request, res: Response) => {
  res.json(berths);
});

apiRouter.post('/berths', (req: Request, res: Response) => {
  const { name, status } = req.body;
  const newBerth: BerthRecord = {
    id: `b-${Date.now().toString().slice(-4)}`,
    name: name || 'New Berth',
    status: status || 'AVAILABLE',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  berths.push(newBerth);
  res.status(201).json(newBerth);
});

// 6. Visits
apiRouter.get('/visits', (req: Request, res: Response) => {
  res.json(visits);
});

apiRouter.get('/vessel-visits', (req: Request, res: Response) => {
  res.json(visits);
});

apiRouter.get('/visits/:id', (req: Request, res: Response) => {
  const visit = visits.find((v) => v.id === req.params.id);
  if (!visit) {
    res.status(404).json({ detail: 'Vessel visit not found.' });
    return;
  }
  res.json(visit);
});

// 7. Readings
apiRouter.get('/visits/:id/readings', (req: Request, res: Response) => {
  const visitReadings = readings.filter((r) => r.visit_id === req.params.id);
  res.json(visitReadings);
});

apiRouter.post('/visits/:id/readings', (req: Request, res: Response) => {
  const visit = visits.find((v) => v.id === req.params.id);
  if (!visit) {
    res.status(404).json({ detail: 'Vessel visit not found.' });
    return;
  }

  const {
    recorded_at,
    source,
    unloaded_t,
    observed_rate_tph,
    buffer_level_t,
    buffer_capacity_t,
    packaging_rate_tph,
    unloading_status,
    notes,
  } = req.body;

  const newReading: ReadingRecord = {
    id: `rd-${Date.now().toString().slice(-6)}`,
    visit_id: visit.id,
    recorded_at: recorded_at || new Date().toISOString(),
    source: source || 'MANUAL',
    unloaded_t: Number(unloaded_t) || 0,
    observed_rate_tph: observed_rate_tph ? Number(observed_rate_tph) : null,
    buffer_level_t: buffer_level_t ? Number(buffer_level_t) : null,
    buffer_capacity_t: buffer_capacity_t ? Number(buffer_capacity_t) : null,
    packaging_rate_tph: packaging_rate_tph ? Number(packaging_rate_tph) : null,
    unloading_status: unloading_status || 'ACTIVE',
    packaging_status: 'ACTIVE',
    notes: notes || null,
    created_at: new Date().toISOString(),
  };

  readings.push(newReading);
  const pred = computePredictionForVisit(visit, newReading);

  res.status(201).json({
    reading: newReading,
    prediction: pred,
    warnings: [],
  });
});

// 8. Delays
apiRouter.get('/visits/:id/delays', (req: Request, res: Response) => {
  const visitDelays = delays.filter((d) => d.visit_id === req.params.id);
  res.json(visitDelays);
});

apiRouter.post('/visits/:id/delays', (req: Request, res: Response) => {
  const { start_time, end_time, category, cause, responsible_area, equipment, description } = req.body;

  const newDelay: DelayRecord = {
    id: `del-${Date.now().toString().slice(-6)}`,
    visit_id: req.params.id,
    start_time: start_time || new Date().toISOString(),
    end_time: end_time || null,
    category: category || 'OPERATIONAL',
    cause: cause || description || 'Unspecified delay',
    responsible_area: responsible_area || 'Operations',
    equipment: equipment || null,
    description: description || cause || null,
    created_at: new Date().toISOString(),
  };

  delays.push(newDelay);
  res.status(201).json(newDelay);
});

// 9. Upcoming Calls
apiRouter.get('/upcoming-calls', (req: Request, res: Response) => {
  res.json(upcomingCalls);
});

// ---------------------------------------------------------------------------
// 9b. Vessel Activities Engine Endpoints
// ---------------------------------------------------------------------------

// Helper to check write permissions
function canEditActivities(req: Request): boolean {
  const user = (req as any).user;
  if (!user) return true; // Default allow in demo mode
  return user.role === 'Admin' || user.role === 'Operations' || user.role === 'Management';
}

function canOverrideDependency(req: Request): boolean {
  const user = (req as any).user;
  if (!user) return true;
  return user.role === 'Admin' || user.role === 'Operations';
}

// GET /activities
apiRouter.get('/activities', async (req: Request, res: Response) => {
  try {
    const { vessel_id, voyage_id, status, execution_mode, activity_type } = req.query;
    const activities = await activityService.getActivities({
      vesselId: vessel_id as string,
      voyageId: voyage_id as string,
      status: status as any,
      executionMode: execution_mode as any,
      activityType: activity_type as string,
    });
    res.json(activities);
  } catch (err: unknown) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// POST /activities
apiRouter.post('/activities', async (req: Request, res: Response) => {
  if (!canEditActivities(req)) {
    res.status(403).json({ error: 'Permission denied: Viewers cannot create activities.' });
    return;
  }
  try {
    const userEmail = (req as any).user?.email || 'ops.dispatcher@turkysgroup.co.tz';
    const created = await activityService.createActivity(req.body, userEmail);
    res.status(201).json(created);
  } catch (err: unknown) {
    res.status(400).json({ error: (err as Error).message });
  }
});

// GET /activities/:id
apiRouter.get('/activities/:id', async (req: Request, res: Response) => {
  try {
    const act = await activityService.getActivityById(req.params.id);
    if (!act) {
      res.status(404).json({ error: `Activity ${req.params.id} not found.` });
      return;
    }
    res.json(act);
  } catch (err: unknown) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// GET /vessels/:vesselId/activities
apiRouter.get('/vessels/:vesselId/activities', async (req: Request, res: Response) => {
  try {
    const list = await activityService.getVesselActivities(req.params.vesselId);
    res.json(list);
  } catch (err: unknown) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// GET /voyages/:voyageId/activities
apiRouter.get('/voyages/:voyageId/activities', async (req: Request, res: Response) => {
  try {
    const list = await activityService.getVoyageActivities(req.params.voyageId);
    res.json(list);
  } catch (err: unknown) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// POST /activities/:id/start
apiRouter.post('/activities/:id/start', async (req: Request, res: Response) => {
  if (!canEditActivities(req)) {
    res.status(403).json({ error: 'Permission denied.' });
    return;
  }
  try {
    const { started_at, current_activity_resolution, override_dependency_reason } = req.body;
    const userEmail = (req as any).user?.email || 'ops.dispatcher@turkysgroup.co.tz';

    const result = await activityService.startActivity(
      req.params.id,
      {
        startedAt: started_at,
        resolution: current_activity_resolution,
        overrideDependencyReason: override_dependency_reason,
      },
      userEmail
    );

    if (result.conflict) {
      res.status(409).json({
        conflict: result.conflict,
        activity: result.activity,
        message: result.conflict.message,
      });
      return;
    }

    res.json(result);
  } catch (err: unknown) {
    res.status(400).json({ error: (err as Error).message });
  }
});

// POST /activities/:id/stop
apiRouter.post('/activities/:id/stop', async (req: Request, res: Response) => {
  if (!canEditActivities(req)) {
    res.status(403).json({ error: 'Permission denied.' });
    return;
  }
  try {
    const { reason, notes } = req.body;
    if (!reason || !reason.trim()) {
      res.status(400).json({ error: 'Stop reason is required.' });
      return;
    }
    const userEmail = (req as any).user?.email || 'ops.dispatcher@turkysgroup.co.tz';
    const stopped = await activityService.stopActivity(req.params.id, { reason, notes }, userEmail);
    res.json(stopped);
  } catch (err: unknown) {
    res.status(400).json({ error: (err as Error).message });
  }
});

// POST /activities/:id/resume
apiRouter.post('/activities/:id/resume', async (req: Request, res: Response) => {
  if (!canEditActivities(req)) {
    res.status(403).json({ error: 'Permission denied.' });
    return;
  }
  try {
    const { notes } = req.body;
    const userEmail = (req as any).user?.email || 'ops.dispatcher@turkysgroup.co.tz';
    const resumed = await activityService.resumeActivity(req.params.id, { notes }, userEmail);
    res.json(resumed);
  } catch (err: unknown) {
    res.status(400).json({ error: (err as Error).message });
  }
});

// POST /activities/:id/complete
apiRouter.post('/activities/:id/complete', async (req: Request, res: Response) => {
  if (!canEditActivities(req)) {
    res.status(403).json({ error: 'Permission denied.' });
    return;
  }
  try {
    const { actual_end, completion_notes } = req.body;
    const userEmail = (req as any).user?.email || 'ops.dispatcher@turkysgroup.co.tz';
    const result = await activityService.completeActivity(
      req.params.id,
      { actualEnd: actual_end, completionNotes: completion_notes },
      userEmail
    );
    res.json(result);
  } catch (err: unknown) {
    res.status(400).json({ error: (err as Error).message });
  }
});

// POST /activities/:id/cancel
apiRouter.post('/activities/:id/cancel', async (req: Request, res: Response) => {
  if (!canEditActivities(req)) {
    res.status(403).json({ error: 'Permission denied.' });
    return;
  }
  try {
    const { cancellation_reason, reason, notes } = req.body;
    const actualReason = cancellation_reason || reason;
    if (!actualReason || !actualReason.trim()) {
      res.status(400).json({ error: 'Cancellation reason is required.' });
      return;
    }
    const userEmail = (req as any).user?.email || 'ops.dispatcher@turkysgroup.co.tz';
    const cancelled = await activityService.cancelActivity(req.params.id, { reason: actualReason, notes }, userEmail);
    res.json(cancelled);
  } catch (err: unknown) {
    res.status(400).json({ error: (err as Error).message });
  }
});

// POST /activities/:id/skip
apiRouter.post('/activities/:id/skip', async (req: Request, res: Response) => {
  if (!canEditActivities(req)) {
    res.status(403).json({ error: 'Permission denied.' });
    return;
  }
  try {
    const { reason, notes } = req.body;
    if (!reason || !reason.trim()) {
      res.status(400).json({ error: 'Skip reason is required.' });
      return;
    }
    const userEmail = (req as any).user?.email || 'ops.dispatcher@turkysgroup.co.tz';
    const skipped = await activityService.skipActivity(req.params.id, { reason, notes }, userEmail);
    res.json(skipped);
  } catch (err: unknown) {
    res.status(400).json({ error: (err as Error).message });
  }
});

// POST /activities/:id/override-dependency
apiRouter.post('/activities/:id/override-dependency', async (req: Request, res: Response) => {
  if (!canOverrideDependency(req)) {
    res.status(403).json({ error: 'Permission denied: Only Admin or Operations may override dependencies.' });
    return;
  }
  try {
    const { reason, notes } = req.body;
    if (!reason || !reason.trim()) {
      res.status(400).json({ error: 'Override reason is strictly required.' });
      return;
    }
    const userEmail = (req as any).user?.email || 'ops.dispatcher@turkysgroup.co.tz';
    const result = await activityService.startActivity(
      req.params.id,
      { overrideDependencyReason: reason },
      userEmail
    );
    res.json(result);
  } catch (err: unknown) {
    res.status(400).json({ error: (err as Error).message });
  }
});

// POST /activities/:id/move
apiRouter.post('/activities/:id/move', async (req: Request, res: Response) => {
  if (!canEditActivities(req)) {
    res.status(403).json({ error: 'Permission denied.' });
    return;
  }
  try {
    const { direction } = req.body;
    if (direction !== 'UP' && direction !== 'DOWN') {
      res.status(400).json({ error: 'Direction must be UP or DOWN.' });
      return;
    }
    const userEmail = (req as any).user?.email || 'ops.dispatcher@turkysgroup.co.tz';
    const updatedList = await activityService.moveActivity(req.params.id, direction, userEmail);
    res.json(updatedList);
  } catch (err: unknown) {
    res.status(400).json({ error: (err as Error).message });
  }
});

// POST /activities/:id/complete-and-start-next
apiRouter.post('/activities/:id/complete-and-start-next', async (req: Request, res: Response) => {
  if (!canEditActivities(req)) {
    res.status(403).json({ error: 'Permission denied.' });
    return;
  }
  try {
    const { completion_notes } = req.body;
    const userEmail = (req as any).user?.email || 'ops.dispatcher@turkysgroup.co.tz';
    const result = await activityService.completeAndStartNext(
      req.params.id,
      { completionNotes: completion_notes },
      userEmail
    );
    res.json(result);
  } catch (err: unknown) {
    res.status(400).json({ error: (err as Error).message });
  }
});

// 10. AI Assistant Endpoint (NLP + Vector Retrieval + Grounded Gemini Model)
let genAIClient: GoogleGenAI | null = null;
function getGenAI(): GoogleGenAI | null {
  if (!genAIClient && process.env.GEMINI_API_KEY) {
    genAIClient = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }
  return genAIClient;
}

apiRouter.post('/ai/assistant', async (req: Request, res: Response) => {
  const { prompt, context, conversationHistory } = req.body;
  if (!prompt) {
    res.status(400).json({ error: 'Prompt is required.' });
    return;
  }

  // 1. Semantic search & entity/intent extraction
  const retrieved = performSemanticSearch(prompt, conversationHistory);

  // 2. Build live grounded operational data
  const groundedData = buildGroundedOperationalSnapshot(context);

  // 3. Generate high-precision baseline factual analyst response
  const baselineResponse = generateFactualAnalystResponse(prompt, retrieved, groundedData);
  let finalResult: AssistantAnalysisResult = { ...baselineResponse };

  // 4. If Gemini API is available, enhance with gemini-3.8-flash while strictly enforcing grounding rules
  const ai = getGenAI();
  if (ai) {
    try {
      const systemInstruction = `You are the senior VIGOR Port Operations Analyst for Vigor Cement Works / Turkys Group in Zanzibar.
You explain vessel schedules, berth conflicts, production, dispatch, and fuel status using the latest operational data.

STRICT OPERATIONAL RULES:
1. The system NO LONGER has live vessel GPS, AIS, or real-time location tracking. The vessel module is based purely on schedules, voyage rotations, recorded arrivals/departures, and pneumatic discharge telemetry. NEVER claim to monitor real-time vessel movements, GPS, AIS, or live coordinates.
2. Ground all answers strictly in the provided Live System Data. NEVER hallucinate or invent times, quantities, delays, or positions.
3. Keep answers concise: 2 to 5 clear, conversational, explanatory sentences. Do NOT output raw database objects, JSON dumps, or technical field names. Explain what is happening first in plain language.
4. Output your response strictly as valid JSON matching this schema:
{
  "answer": "string (2-5 conversational, explanatory sentences)",
  "severity": "warning" | "alert" | "info" | "normal",
  "statusBadge": "string e.g. '⚠ Berth conflict detected' or null",
  "relatedEntity": "string e.g. 'MV VIGOR 03' or null",
  "relatedRoute": "string e.g. 'berths' | 'control-tower' | 'fuel' | 'payments' | 'vessels' | 'vessel-detail' | 'manufacturer-queue' | 'alerts'",
  "routeLabel": "string e.g. 'View Berth Schedule →'"
}`;

      const geminiPrompt = `${systemInstruction}

LIVE SYSTEM DATA:
${JSON.stringify(groundedData, null, 2)}

RETRIEVED OPERATIONAL CONCEPT & RULES:
Concept: ${retrieved.concept.conceptName}
Category: ${retrieved.concept.category}
Operational Rules: ${retrieved.concept.operationalRules.join('; ')}
Target Route: ${retrieved.targetRoute}
Default Route Label: ${retrieved.routeLabel}

DETECTED ENTITIES & INTENT:
Entities: ${JSON.stringify(retrieved.detectedEntities)}
Intent: ${retrieved.intent}

RECENT CONVERSATION HISTORY:
${JSON.stringify(conversationHistory || [], null, 2)}

USER QUESTION:
"${prompt}"

Produce JSON output only:`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: [
          {
            role: 'user',
            parts: [{ text: geminiPrompt }],
          },
        ],
        config: {
          responseMimeType: 'application/json',
        },
      });

      if (response.text) {
        try {
          const parsed = JSON.parse(response.text);
          if (parsed && typeof parsed.answer === 'string' && parsed.answer.trim().length > 10) {
            finalResult = {
              answer: parsed.answer.trim(),
              severity: parsed.severity || baselineResponse.severity,
              statusBadge: parsed.statusBadge || baselineResponse.statusBadge,
              relatedEntity: parsed.relatedEntity || baselineResponse.relatedEntity,
              relatedRoute: parsed.relatedRoute || baselineResponse.relatedRoute,
              routeLabel: parsed.routeLabel || baselineResponse.routeLabel,
              vesselId: baselineResponse.vesselId,
            };
          }
        } catch (jsonErr) {
          // Fallback to baseline response if JSON parse fails
          console.warn('[Gemini Response JSON Parse Warning]:', jsonErr);
        }
      }
    } catch (err: unknown) {
      console.warn('[Gemini API Call Failed - Using Grounded Semantic Baseline]:', err);
    }
  }

  // Ensure route is valid
  const matchedRoute = SYSTEM_ROUTES.find((r) => r.id === finalResult.relatedRoute);
  if (!matchedRoute) {
    finalResult.relatedRoute = baselineResponse.relatedRoute;
    finalResult.routeLabel = baselineResponse.routeLabel;
  }

  res.json({
    answer: finalResult.answer,
    severity: finalResult.severity,
    statusBadge: finalResult.statusBadge,
    relatedEntity: finalResult.relatedEntity,
    relatedRoute: finalResult.relatedRoute,
    routeLabel: finalResult.routeLabel,
    vesselId: finalResult.vesselId,
    actions: [
      {
        label: finalResult.routeLabel,
        page: finalResult.relatedRoute,
        vesselId: finalResult.vesselId,
      },
    ],
    semanticMatch: {
      concept: retrieved.concept.conceptName,
      intent: retrieved.intent,
      score: Math.round(retrieved.similarityScore * 100) / 100,
    },
  });
});

// Mount /api/v1 router
app.use('/api/v1', apiRouter);

// Root health check endpoint
app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', service: 'vigor-smart-port' });
});

// ---------------------------------------------------------------------------
// Server Bootstrap & Vite Integration
// ---------------------------------------------------------------------------

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`VIGOR Smart Port Operations server running on port ${PORT}`);
  });
}

if (process.env.VERCEL !== '1') {
  startServer();
}

export default app;
export { app, startServer };
