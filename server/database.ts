import 'dotenv/config';
import mysql, { Pool, PoolOptions } from 'mysql2/promise';

export interface DatabaseStatus {
  connected: boolean;
  provider: 'MySQL / MariaDB' | 'In-Memory Resilient Engine';
  host: string;
  database: string;
  user: string;
  message: string;
  lastChecked: string;
}

class DatabaseManager {
  private pool: Pool | null = null;
  private isConfigured = false;
  private lastStatus: DatabaseStatus;

  constructor() {
    this.lastStatus = {
      connected: false,
      provider: 'In-Memory Resilient Engine',
      host: process.env.DB_HOST || 'cpanel.turkysgroup.co.tz (not configured)',
      database: process.env.DB_NAME || 'vigor_port_ops',
      user: process.env.DB_USER || 'vigor_admin',
      message: 'Operating in local memory engine. Awaiting cPanel MySQL credentials.',
      lastChecked: new Date().toISOString(),
    };

    this.initializePool();
  }

  private initializePool(): void {
    const host = process.env.DB_HOST || process.env.DATABASE_HOST;
    const user = process.env.DB_USER || process.env.DATABASE_USER;
    const password = process.env.DB_PASSWORD || process.env.DATABASE_PASSWORD;
    const database = process.env.DB_NAME || process.env.DATABASE_NAME;
    const port = Number(process.env.DB_PORT || process.env.DATABASE_PORT || 3306);

    if (host && user && database) {
      this.isConfigured = true;
      try {
        const poolConfig: PoolOptions = {
          host,
          port,
          user,
          password: password || '',
          database,
          waitForConnections: true,
          connectionLimit: 10,
          queueLimit: 0,
          connectTimeout: 5000,
          dateStrings: true,
          decimalNumbers: true,
          timezone: 'Z',
        };

        this.pool = mysql.createPool(poolConfig);
        console.log(`[DB] MySQL pool created for ${user}@${host}:${port}/${database}`);
      } catch (err: unknown) {
        console.warn('[DB] Failed to create MySQL pool, using fallback engine:', err);
        this.pool = null;
      }
    } else {
      this.isConfigured = false;
      console.log('[DB] No cPanel MySQL credentials in environment; utilizing fallback state engine.');
    }
  }

  public async checkHealth(): Promise<DatabaseStatus> {
    const now = new Date().toISOString();
    const host = process.env.DB_HOST || process.env.DATABASE_HOST || 'cPanel MySQL Server';
    const database = process.env.DB_NAME || process.env.DATABASE_NAME || 'vigor_port_ops';
    const user = process.env.DB_USER || process.env.DATABASE_USER || 'vigor_admin';

    if (!this.isConfigured || !this.pool) {
      this.lastStatus = {
        connected: false,
        provider: 'In-Memory Resilient Engine',
        host,
        database,
        user,
        message: 'No external DB_HOST provided. Serving with internal transactional memory store.',
        lastChecked: now,
      };
      return this.lastStatus;
    }

    try {
      const [rows] = await this.pool.query('SELECT 1 as ping, NOW() as server_time');
      this.lastStatus = {
        connected: true,
        provider: 'MySQL / MariaDB',
        host,
        database,
        user,
        message: `Successfully connected to cPanel MySQL at ${host} (Ping verified).`,
        lastChecked: now,
      };
    } catch (err: unknown) {
      const errMsg = (err as Error)?.message || 'Connection refused or timed out';
      this.lastStatus = {
        connected: false,
        provider: 'MySQL / MariaDB',
        host,
        database,
        user,
        message: `Database connection failed (${errMsg}). Database writes are unavailable; no fallback is used.`,
        lastChecked: now,
      };
    }

    return this.lastStatus;
  }

  public async executeQuery<T = any>(sql: string, params: unknown[] = []): Promise<T[]> {
    if (this.pool) {
      try {
        const connection = await this.pool.getConnection();
        try {
          await connection.query("SET time_zone = '+00:00'");
          const [results] = await connection.query(sql, params);
          return results as T[];
        } finally { connection.release(); }
      } catch (err: unknown) {
        console.error('[DB Query Error]', err);
        throw err;
      }
    }
    throw new Error('Database pool not connected');
  }

  public isUsingMySQL(): boolean {
    return this.isConfigured;
  }

  public getPool(): Pool | null {
    return this.pool;
  }
}

export const dbManager = new DatabaseManager();
