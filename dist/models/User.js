"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.User = void 0;
const bcrypt_1 = __importDefault(require("bcrypt"));
const uuid_1 = require("uuid");
class User {
    constructor(pool) {
        this.pool = pool;
    }
    async create(userData) {
        const id = (0, uuid_1.v4)();
        const password_hash = await bcrypt_1.default.hash(userData.password, 12);
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
    async findById(id) {
        const query = `
      SELECT id, email, name, bio, avatar_url, role, email_verified, created_at, updated_at
      FROM users
      WHERE id = $1
    `;
        const result = await this.pool.query(query, [id]);
        return result.rows[0] || null;
    }
    async findByEmail(email) {
        const query = `
      SELECT id, email, name, bio, avatar_url, role, email_verified, created_at, updated_at
      FROM users
      WHERE email = $1
    `;
        const result = await this.pool.query(query, [email]);
        return result.rows[0] || null;
    }
    async findByEmailWithPassword(email) {
        const query = `
      SELECT id, email, password_hash, name, bio, avatar_url, role, email_verified, created_at, updated_at
      FROM users
      WHERE email = $1
    `;
        const result = await this.pool.query(query, [email]);
        return result.rows[0] || null;
    }
    async update(id, updateData) {
        const fields = [];
        const values = [];
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
    async verifyPassword(password, hash) {
        return bcrypt_1.default.compare(password, hash);
    }
    async emailExists(email) {
        const query = 'SELECT 1 FROM users WHERE email = $1';
        const result = await this.pool.query(query, [email]);
        return result.rows.length > 0;
    }
    async delete(id) {
        const query = 'DELETE FROM users WHERE id = $1';
        const result = await this.pool.query(query, [id]);
        return (result.rowCount ?? 0) > 0;
    }
    // Validation methods
    static validateEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }
    static validatePassword(password) {
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
    static validateRole(role) {
        return ['creator', 'subscriber', 'admin'].includes(role);
    }
}
exports.User = User;
//# sourceMappingURL=User.js.map