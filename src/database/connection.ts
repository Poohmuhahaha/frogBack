import { Pool, PoolClient, QueryResult } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl?: boolean;
  max?: number;
  idleTimeoutMillis?: number;
  connectionTimeoutMillis?: number;
}

class Database {
  private pool: Pool;
  private isConnected: boolean = false;

  constructor() {
    const config: DatabaseConfig = {
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME || 'frogtales_dev',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || '',
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
      max: parseInt(process.env.DB_MAX_CONNECTIONS || '20'),
      idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT || '30000'),
      connectionTimeoutMillis: parseInt(process.env.DB_CONNECTION_TIMEOUT || '2000'),
    };

    this.pool = new Pool(config);

    // Handle pool errors
    this.pool.on('error', (err) => {
      console.error('Unexpected error on idle client', err);
      process.exit(-1);
    });

    // Handle pool connection
    this.pool.on('connect', () => {
      console.log('Database client connected');
      this.isConnected = true;
    });

    // Handle pool removal
    this.pool.on('remove', () => {
      console.log('Database client removed');
    });
  }

  /**
   * Initialize database connection and test connectivity
   */
  async connect(): Promise<void> {
    try {
      const client = await this.pool.connect();
      await client.query('SELECT NOW()');
      client.release();
      console.log('Database connection established successfully');
      this.isConnected = true;
    } catch (error) {
      console.error('Failed to connect to database:', error);
      throw error;
    }
  }

  /**
   * Execute a query with parameters
   */
  async query<T = any>(text: string, params?: any[]): Promise<QueryResult<T>> {
    const start = Date.now();
    try {
      const result = await this.pool.query<T>(text, params);
      const duration = Date.now() - start;

      if (process.env.NODE_ENV === 'development') {
        console.log('Executed query', { text, duration, rows: result.rowCount });
      }

      return result;
    } catch (error) {
      console.error('Database query error:', { text, params, error });
      throw error;
    }
  }

  /**
   * Get a client from the pool for transactions
   */
  async getClient(): Promise<PoolClient> {
    return await this.pool.connect();
  }

  /**
   * Execute multiple queries in a transaction
   */
  async transaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.getClient();
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Close all connections in the pool
   */
  async close(): Promise<void> {
    await this.pool.end();
    this.isConnected = false;
    console.log('Database connections closed');
  }

  /**
   * Check if database is connected
   */
  isConnectionActive(): boolean {
    return this.isConnected;
  }

  /**
   * Get pool status information
   */
  getPoolStatus() {
    return {
      totalCount: this.pool.totalCount,
      idleCount: this.pool.idleCount,
      waitingCount: this.pool.waitingCount,
    };
  }
}

// Simple query builder helpers
export class QueryBuilder {
  /**
   * Build INSERT query
   */
  static insert(table: string, data: Record<string, any>): { text: string; values: any[] } {
    const keys = Object.keys(data);
    const values = Object.values(data);
    const placeholders = keys.map((_, index) => `$${index + 1}`).join(', ');

    return {
      text: `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders}) RETURNING *`,
      values,
    };
  }

  /**
   * Build UPDATE query
   */
  static update(table: string, data: Record<string, any>, whereClause: string, whereValues: any[]): { text: string; values: any[] } {
    const keys = Object.keys(data);
    const values = Object.values(data);
    const setClause = keys.map((key, index) => `${key} = $${index + 1}`).join(', ');

    // Adjust parameter numbers for WHERE clause
    const adjustedWhereClause = whereClause.replace(/\$(\d+)/g, (match, num) => {
      return `$${parseInt(num) + keys.length}`;
    });

    return {
      text: `UPDATE ${table} SET ${setClause} WHERE ${adjustedWhereClause} RETURNING *`,
      values: [...values, ...whereValues],
    };
  }

  /**
   * Build SELECT query
   */
  static select(table: string, columns: string[] = ['*'], whereClause?: string, whereValues?: any[]): { text: string; values: any[] } {
    const columnsStr = columns.join(', ');
    let query = `SELECT ${columnsStr} FROM ${table}`;

    if (whereClause) {
      query += ` WHERE ${whereClause}`;
    }

    return {
      text: query,
      values: whereValues || [],
    };
  }

  /**
   * Build DELETE query
   */
  static delete(table: string, whereClause: string, whereValues: any[]): { text: string; values: any[] } {
    return {
      text: `DELETE FROM ${table} WHERE ${whereClause} RETURNING *`,
      values: whereValues,
    };
  }
}

// Create singleton instance
const database = new Database();

export default database;
export { Database, type DatabaseConfig };