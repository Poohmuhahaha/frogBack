import { Pool } from 'pg';
import bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';

export interface UserData {
  id?: string;
  email: string;
  password_hash?: string;
  name: string;
  bio?: string;
  avatar_url?: string;
  role: 'creator' | 'subscriber' | 'admin';
  email_verified?: boolean;
  created_at?: Date;
  updated_at?: Date;
}

export interface CreateUserData {
  email: string;
  password: string;
  name: string;
  bio?: string;
  avatar_url?: string;
  role: 'creator' | 'subscriber' | 'admin';
}

export interface UpdateUserData {
  name?: string;
  bio?: string;
  avatar_url?: string;
  email_verified?: boolean;
}

export class User {
  private pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  async create(userData: CreateUserData): Promise<UserData> {
    const id = uuidv4();
    const password_hash = await bcrypt.hash(userData.password, 12);
    const now = new Date();

    const query = `
      INSERT INTO users (
        id, email, password_hash, name, bio, avatar_url, role,
        email_verified, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING id, email, name, bio, avatar_url, role, email_verified, created_at, updated_at
    `;

    const values = [
      id,
      userData.email,
      password_hash,
      userData.name,
      userData.bio || null,
      userData.avatar_url || null,
      userData.role,
      false, // email_verified defaults to false
      now,
      now
    ];

    const result = await this.pool.query(query, values);
    return result.rows[0];
  }

  async findById(id: string): Promise<UserData | null> {
    const query = `
      SELECT id, email, name, bio, avatar_url, role, email_verified, created_at, updated_at
      FROM users
      WHERE id = $1
    `;

    const result = await this.pool.query(query, [id]);
    return result.rows[0] || null;
  }

  async findByEmail(email: string): Promise<UserData | null> {
    const query = `
      SELECT id, email, name, bio, avatar_url, role, email_verified, created_at, updated_at
      FROM users
      WHERE email = $1
    `;

    const result = await this.pool.query(query, [email]);
    return result.rows[0] || null;
  }

  async findByEmailWithPassword(email: string): Promise<(UserData & { password_hash: string }) | null> {
    const query = `
      SELECT id, email, password_hash, name, bio, avatar_url, role, email_verified, created_at, updated_at
      FROM users
      WHERE email = $1
    `;

    const result = await this.pool.query(query, [email]);
    return result.rows[0] || null;
  }

  async update(id: string, updateData: UpdateUserData): Promise<UserData | null> {
    const fields: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    // Build dynamic update query
    Object.entries(updateData).forEach(([key, value]) => {
      if (value !== undefined) {
        fields.push(`${key} = $${paramCount}`);
        values.push(value);
        paramCount++;
      }
    });

    if (fields.length === 0) {
      return this.findById(id);
    }

    fields.push(`updated_at = $${paramCount}`);
    values.push(new Date());
    values.push(id);

    const query = `
      UPDATE users
      SET ${fields.join(', ')}
      WHERE id = $${paramCount + 1}
      RETURNING id, email, name, bio, avatar_url, role, email_verified, created_at, updated_at
    `;

    const result = await this.pool.query(query, values);
    return result.rows[0] || null;
  }

  async verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  async emailExists(email: string): Promise<boolean> {
    const query = 'SELECT 1 FROM users WHERE email = $1';
    const result = await this.pool.query(query, [email]);
    return result.rows.length > 0;
  }

  async delete(id: string): Promise<boolean> {
    const query = 'DELETE FROM users WHERE id = $1';
    const result = await this.pool.query(query, [id]);
    return (result.rowCount ?? 0) > 0;
  }

  // Validation methods
  static validateEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  static validatePassword(password: string): { valid: boolean; message?: string } {
    if (password.length < 8) {
      return { valid: false, message: 'Password must be at least 8 characters long' };
    }

    if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(password)) {
      return {
        valid: false,
        message: 'Password must contain at least one lowercase letter, one uppercase letter, and one number'
      };
    }

    return { valid: true };
  }

  static validateRole(role: string): boolean {
    return ['creator', 'subscriber', 'admin'].includes(role);
  }
}