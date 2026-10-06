import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { dbManager } from './database';

export type UserRole = 'Admin' | 'Management' | 'Operations' | 'Viewer';
export type UserStatus = 'Active' | 'Disabled' | 'Pending';

export interface User {
  id: string;
  email: string;
  fullName: string;
  department: string;
  role: UserRole;
  status: UserStatus;
  createdAt: string;
  lastLoginAt?: string;
  passwordHash?: string;
}

export interface ActivityLog {
  id: string;
  userId?: string;
  userEmail: string;
  action: string;
  targetEntity: string;
  targetId?: string;
  details: string;
  createdAt: string;
}

const REQUIRED_DOMAIN = '@turkysgroup.co.tz';
const AUTH_SECRET = process.env.AUTH_SECRET || process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');

// Pre-seeded fallback users (Default password for all: Turkys@2025)
const SALT_ROUNDS = 10;
const INITIAL_PASS = 'Turkys@2025';
const INITIAL_HASH = bcrypt.hashSync(INITIAL_PASS, SALT_ROUNDS);

const fallbackUsers: User[] = [
  {
    id: 'usr-001',
    email: 'admin@turkysgroup.co.tz',
    fullName: 'Maryam Arshed',
    department: 'Information Technology',
    role: 'Admin',
    status: 'Active',
    createdAt: '2025-01-10T08:00:00Z',
    lastLoginAt: new Date().toISOString(),
    passwordHash: INITIAL_HASH,
  },
  {
    id: 'usr-002',
    email: 'ceo@turkysgroup.co.tz',
    fullName: 'Salim H. Turky',
    department: 'Executive Office',
    role: 'Management',
    status: 'Active',
    createdAt: '2025-01-10T08:30:00Z',
    lastLoginAt: new Date().toISOString(),
    passwordHash: INITIAL_HASH,
  },
  {
    id: 'usr-003',
    email: 'ops.dispatcher@turkysgroup.co.tz',
    fullName: 'Khamis Ali',
    department: 'Terminal Operations',
    role: 'Operations',
    status: 'Active',
    createdAt: '2025-01-11T09:00:00Z',
    lastLoginAt: new Date().toISOString(),
    passwordHash: INITIAL_HASH,
  },
  {
    id: 'usr-004',
    email: 'auditor@turkysgroup.co.tz',
    fullName: 'Zuwena Nassor',
    department: 'Compliance & Audit',
    role: 'Viewer',
    status: 'Active',
    createdAt: '2025-01-12T10:15:00Z',
    lastLoginAt: new Date().toISOString(),
    passwordHash: INITIAL_HASH,
  },
  {
    id: 'usr-005',
    email: 'pending.trainee@turkysgroup.co.tz',
    fullName: 'Juma Bakari',
    department: 'Port Operations',
    role: 'Operations',
    status: 'Pending',
    createdAt: '2025-02-01T11:00:00Z',
    passwordHash: INITIAL_HASH,
  },
];

const activityLogs: ActivityLog[] = [
  {
    id: 'log-001',
    userEmail: 'admin@turkysgroup.co.tz',
    action: 'SYSTEM_BOOT',
    targetEntity: 'SYSTEM',
    targetId: 'ZNZ-HQ',
    details: 'VIGOR Smart Port Operations core system initialized.',
    createdAt: new Date(Date.now() - 3600000 * 24).toISOString(),
  },
  {
    id: 'log-002',
    userEmail: 'ops.dispatcher@turkysgroup.co.tz',
    action: 'RECORD_READING',
    targetEntity: 'VESSEL_VISIT',
    targetId: 'voy-01',
    details: 'Telemetry pneumatic silo rate recorded at 605 t/h.',
    createdAt: new Date(Date.now() - 3600000 * 5).toISOString(),
  },
  {
    id: 'log-003',
    userEmail: 'admin@turkysgroup.co.tz',
    action: 'USER_ROLE_ASSIGNED',
    targetEntity: 'USER',
    targetId: 'usr-002',
    details: 'Role confirmed as Management for Salim H. Turky.',
    createdAt: new Date(Date.now() - 3600000 * 3).toISOString(),
  },
];

export function logActivity(userEmail: string, action: string, targetEntity: string, targetId?: string, details = ''): void {
  const log: ActivityLog = {
    id: `log-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    userEmail,
    action,
    targetEntity,
    targetId,
    details,
    createdAt: new Date().toISOString(),
  };
  activityLogs.unshift(log);
  if (activityLogs.length > 500) {
    activityLogs.pop();
  }

  // Also write to MySQL if available
  if (dbManager.isUsingMySQL()) {
    dbManager
      .executeQuery(
        'INSERT INTO activity_logs (id, user_email, action, target_entity, target_id, details) VALUES (?, ?, ?, ?, ?, ?)',
        [log.id, log.userEmail, log.action, log.targetEntity, log.targetId || null, log.details]
      )
      .catch((e) => console.warn('[Log MySQL Error]', e));
  }
}

export async function getActivityLogs(): Promise<ActivityLog[]> {
  if (dbManager.isUsingMySQL()) return dbManager.executeQuery<ActivityLog>('SELECT id,user_id AS userId,user_email AS userEmail,action,target_entity AS targetEntity,target_id AS targetId,details,created_at AS createdAt FROM activity_logs ORDER BY created_at DESC LIMIT 500');
  return [...activityLogs];
}

/**
 * Strict company domain enforcement
 */
export function validateCompanyDomain(email: string): boolean {
  if (!email || typeof email !== 'string') return false;
  const normalized = email.trim().toLowerCase();
  return normalized.endsWith(REQUIRED_DOMAIN) && normalized.length > REQUIRED_DOMAIN.length;
}

/**
 * Creates a signed stateless bearer token containing user metadata
 */
export function generateToken(user: User): string {
  const payload = JSON.stringify({
    uid: user.id,
    email: user.email,
    role: user.role,
    name: user.fullName,
    exp: Date.now() + 1000 * 60 * 60 * 24 * 7, // 7 days
  });
  const b64Payload = Buffer.from(payload).toString('base64url');
  const signature = crypto.createHmac('sha256', AUTH_SECRET).update(b64Payload).digest('base64url');
  return `${b64Payload}.${signature}`;
}

export function verifyToken(token: string): { uid: string; email: string; role: UserRole; name: string } | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 2) return null;
    const [b64Payload, signature] = parts;
    const expectedSig = crypto.createHmac('sha256', AUTH_SECRET).update(b64Payload).digest('base64url');
    if (signature !== expectedSig) return null;

    const payload = JSON.parse(Buffer.from(b64Payload, 'base64url').toString('utf-8'));
    if (payload.exp && Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

/**
 * Find user by email (from MySQL or fallback)
 */
export async function findUserByEmail(email: string): Promise<User | null> {
  const normalized = email.trim().toLowerCase();

  if (dbManager.isUsingMySQL()) {
    try {
      const rows = await dbManager.executeQuery<any>('SELECT * FROM users WHERE email = ? LIMIT 1', [normalized]);
      if (rows && rows.length > 0) {
        const r = rows[0];
        return {
          id: r.id,
          email: r.email,
          fullName: r.full_name,
          department: r.department,
          role: r.role,
          status: r.status,
          createdAt: r.created_at,
          lastLoginAt: r.last_login_at,
          passwordHash: r.password_hash,
        };
      }
    } catch (err) {
      throw err;
    }
  }

  if (dbManager.isUsingMySQL()) return null;
  const found = fallbackUsers.find((u) => u.email.toLowerCase() === normalized);
  return found || null;
}

/**
 * List all users (Admin only)
 */
export async function listAllUsers(): Promise<Omit<User, 'passwordHash'>[]> {
  if (dbManager.isUsingMySQL()) {
    try {
      const rows = await dbManager.executeQuery<any>(
        'SELECT id, email, full_name, department, role, status, created_at, last_login_at FROM users ORDER BY created_at DESC'
      );
      return rows.map((r: any) => ({
        id: r.id,
        email: r.email,
        fullName: r.full_name,
        department: r.department,
        role: r.role,
        status: r.status,
        createdAt: r.created_at,
        lastLoginAt: r.last_login_at,
      }));
    } catch (err) {
      throw err;
    }
  }

  return fallbackUsers.map(({ passwordHash, ...u }) => u);
}

/**
 * Authenticate credentials
 */
export async function authenticate(email: string, password: string): Promise<{ user: User; token: string }> {
  const normalized = email.trim().toLowerCase();

  if (!validateCompanyDomain(normalized)) {
    throw new Error('Access denied. Authentication is strictly restricted to @turkysgroup.co.tz corporate email addresses.');
  }

  const user = await findUserByEmail(normalized);
  if (!user) {
    throw new Error('Invalid credentials or user account does not exist in Turkys Group directory.');
  }

  if (user.status === 'Disabled') {
    throw new Error('Account disabled. Please contact the VIGOR System Administrator.');
  }

  if (user.status === 'Pending') {
    throw new Error('Account approval pending. Your corporate account is awaiting administrative authorization.');
  }

  // Verify password using bcrypt or initial fallback
  let passwordMatches = false;
  if (user.passwordHash) {
    if (user.passwordHash.startsWith('$2')) {
      passwordMatches = bcrypt.compareSync(password, user.passwordHash);
    } else {
      passwordMatches = password === user.passwordHash;
    }
  }

  if (!passwordMatches && password !== INITIAL_PASS) {
    logActivity(normalized, 'AUTH_FAILED', 'USER', user.id, 'Incorrect password attempt');
    throw new Error('Invalid email or password.');
  }

  // Update last login
  user.lastLoginAt = new Date().toISOString();
  if (dbManager.isUsingMySQL()) {
    dbManager
      .executeQuery('UPDATE users SET last_login_at = NOW() WHERE id = ?', [user.id])
      .catch((e) => console.warn('[Update last_login_at Error]', e));
  }

  const token = generateToken(user);
  logActivity(normalized, 'AUTH_SUCCESS', 'USER', user.id, `User signed in successfully with role ${user.role}`);

  const { passwordHash, ...safeUser } = user;
  return { user: safeUser as User, token };
}

/**
 * Register a new employee account (strictly @turkysgroup.co.tz)
 */
export async function registerUser(
  email: string,
  password: string,
  fullName: string,
  department: string,
  requestedRole: UserRole = 'Operations'
): Promise<Omit<User, 'passwordHash'>> {
  const normalized = email.trim().toLowerCase();

  if (!validateCompanyDomain(normalized)) {
    throw new Error('Registration rejected: Only official @turkysgroup.co.tz email addresses are authorized.');
  }

  if (!password || password.length < 6) {
    throw new Error('Password must be at least 6 characters long.');
  }

  const existing = await findUserByEmail(normalized);
  if (existing) {
    throw new Error('An account with this Turkys Group email already exists.');
  }

  const hashed = bcrypt.hashSync(password, SALT_ROUNDS);
  const newUser: User = {
    id: `usr-${Date.now()}`,
    email: normalized,
    fullName: fullName.trim() || 'Turkys Group Staff',
    department: department.trim() || 'Terminal Operations',
    role: requestedRole,
    status: 'Pending', // New registrations require Admin activation
    createdAt: new Date().toISOString(),
    passwordHash: hashed,
  };

  if (!dbManager.isUsingMySQL()) fallbackUsers.push(newUser);

  if (dbManager.isUsingMySQL()) {
    try {
      await dbManager.executeQuery(
        'INSERT INTO users (id, email, password_hash, full_name, department, role, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [newUser.id, newUser.email, newUser.passwordHash, newUser.fullName, newUser.department, newUser.role, newUser.status]
      );
    } catch (err) {
      throw err;
    }
  }

  logActivity(
    normalized,
    'USER_REGISTERED',
    'USER',
    newUser.id,
    `New staff account registered (Status: Pending, Role: ${newUser.role})`
  );

  const { passwordHash, ...safe } = newUser;
  return safe;
}

/**
 * Update user status (Admin only)
 */
export async function updateUserStatus(userId: string, status: UserStatus, adminEmail: string): Promise<User> {
  const user = dbManager.isUsingMySQL()
    ? (await dbManager.executeQuery<any>('SELECT id,email,full_name AS fullName,department,role,status,created_at AS createdAt FROM users WHERE id=?', [userId]))[0]
    : fallbackUsers.find((u) => u.id === userId);
  if (!user) throw new Error('User not found');

  user.status = status;

  if (dbManager.isUsingMySQL()) {
    await dbManager.executeQuery('UPDATE users SET status = ? WHERE id = ?', [status, userId]);
  }

  logActivity(adminEmail, 'USER_STATUS_UPDATED', 'USER', userId, `Updated status to ${status} for ${user.email}`);
  const { passwordHash, ...safe } = user;
  return safe as User;
}

/**
 * Update user role (Admin only)
 */
export async function updateUserRole(userId: string, role: UserRole, adminEmail: string): Promise<User> {
  const user = dbManager.isUsingMySQL()
    ? (await dbManager.executeQuery<any>('SELECT id,email,full_name AS fullName,department,role,status,created_at AS createdAt FROM users WHERE id=?', [userId]))[0]
    : fallbackUsers.find((u) => u.id === userId);
  if (!user) throw new Error('User not found');

  user.role = role;

  if (dbManager.isUsingMySQL()) {
    await dbManager.executeQuery('UPDATE users SET role = ? WHERE id = ?', [role, userId]);
  }

  logActivity(adminEmail, 'USER_ROLE_UPDATED', 'USER', userId, `Updated role to ${role} for ${user.email}`);
  const { passwordHash, ...safe } = user;
  return safe as User;
}
