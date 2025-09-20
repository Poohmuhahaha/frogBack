"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthService = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const User_1 = require("../models/User");
class AuthService {
    constructor(pool, jwtSecret, jwtExpiresIn) {
        this.user = new User_1.User(pool);
        this.jwtSecret = jwtSecret || process.env.JWT_SECRET || 'default-secret-key';
        this.jwtExpiresIn = jwtExpiresIn || process.env.JWT_EXPIRES_IN || '7d';
    }
    async register(registerData) {
        // Validate input data
        if (!User_1.User.validateEmail(registerData.email)) {
            throw new Error('Invalid email format');
        }
        const passwordValidation = User_1.User.validatePassword(registerData.password);
        if (!passwordValidation.valid) {
            throw new Error(passwordValidation.message || 'Invalid password');
        }
        if (!User_1.User.validateRole(registerData.role)) {
            throw new Error('Invalid role');
        }
        // Check if email already exists
        const emailExists = await this.user.emailExists(registerData.email);
        if (emailExists) {
            throw new Error('Email already registered');
        }
        // Create user
        const newUser = await this.user.create(registerData);
        // Generate JWT token
        const token = this.generateToken({
            userId: newUser.id,
            email: newUser.email,
            role: newUser.role
        });
        return {
            user: this.sanitizeUser(newUser),
            token
        };
    }
    async login(credentials) {
        // Validate input
        if (!credentials.email || !credentials.password) {
            throw new Error('Email and password are required');
        }
        if (!User_1.User.validateEmail(credentials.email)) {
            throw new Error('Invalid email format');
        }
        // Find user with password
        const userWithPassword = await this.user.findByEmailWithPassword(credentials.email);
        if (!userWithPassword) {
            throw new Error('Invalid email or password');
        }
        // Verify password
        const passwordValid = await this.user.verifyPassword(credentials.password, userWithPassword.password_hash);
        if (!passwordValid) {
            throw new Error('Invalid email or password');
        }
        // Generate JWT token
        const token = this.generateToken({
            userId: userWithPassword.id,
            email: userWithPassword.email,
            role: userWithPassword.role
        });
        return {
            user: this.sanitizeUser(userWithPassword),
            token
        };
    }
    async getUserFromToken(token) {
        try {
            const decoded = jsonwebtoken_1.default.verify(token, this.jwtSecret);
            const user = await this.user.findById(decoded.userId);
            if (!user) {
                throw new Error('User not found');
            }
            return user;
        }
        catch (error) {
            if (error instanceof jsonwebtoken_1.default.JsonWebTokenError) {
                throw new Error('Invalid token');
            }
            if (error instanceof jsonwebtoken_1.default.TokenExpiredError) {
                throw new Error('Token expired');
            }
            throw error;
        }
    }
    async refreshToken(token) {
        try {
            const decoded = jsonwebtoken_1.default.verify(token, this.jwtSecret, { ignoreExpiration: true });
            // Verify user still exists
            const user = await this.user.findById(decoded.userId);
            if (!user) {
                throw new Error('User not found');
            }
            // Generate new token
            return this.generateToken({
                userId: user.id,
                email: user.email,
                role: user.role
            });
        }
        catch (error) {
            if (error instanceof jsonwebtoken_1.default.JsonWebTokenError) {
                throw new Error('Invalid token');
            }
            throw error;
        }
    }
    async verifyEmail(userId) {
        const updatedUser = await this.user.update(userId, { email_verified: true });
        if (!updatedUser) {
            throw new Error('User not found');
        }
        return updatedUser;
    }
    async requestPasswordReset(email) {
        const user = await this.user.findByEmail(email);
        if (!user) {
            throw new Error('User not found');
        }
        // Generate reset token (valid for 1 hour)
        const resetToken = jsonwebtoken_1.default.sign({ userId: user.id, type: 'password_reset' }, this.jwtSecret, { expiresIn: '1h' });
        return resetToken;
    }
    async resetPassword(resetToken, newPassword) {
        try {
            const decoded = jsonwebtoken_1.default.verify(resetToken, this.jwtSecret);
            if (decoded.type !== 'password_reset') {
                throw new Error('Invalid reset token');
            }
            const passwordValidation = User_1.User.validatePassword(newPassword);
            if (!passwordValidation.valid) {
                throw new Error(passwordValidation.message || 'Invalid password');
            }
            // Find user and update password
            const user = await this.user.findById(decoded.userId);
            if (!user) {
                throw new Error('User not found');
            }
            // Hash new password and update
            const bcrypt = require('bcrypt');
            const newPasswordHash = await bcrypt.hash(newPassword, 12);
            // Note: updated_at is handled in the direct query below
            // Note: We need to add a method to update password in User model
            // For now, we'll handle it directly here
            const pool = this.user.pool;
            await pool.query('UPDATE users SET password_hash = $1, updated_at = $2 WHERE id = $3', [newPasswordHash, new Date(), decoded.userId]);
        }
        catch (error) {
            if (error instanceof jsonwebtoken_1.default.JsonWebTokenError) {
                throw new Error('Invalid or expired reset token');
            }
            if (error instanceof jsonwebtoken_1.default.TokenExpiredError) {
                throw new Error('Reset token expired');
            }
            throw error;
        }
    }
    generateToken(payload) {
        return jsonwebtoken_1.default.sign(payload, this.jwtSecret, { expiresIn: this.jwtExpiresIn });
    }
    sanitizeUser(user) {
        const { password_hash, ...sanitizedUser } = user;
        return sanitizedUser;
    }
    // Utility methods for token validation
    static extractTokenFromHeader(authHeader) {
        if (!authHeader)
            return null;
        const parts = authHeader.split(' ');
        if (parts.length !== 2 || parts[0] !== 'Bearer') {
            return null;
        }
        return parts[1];
    }
    static isValidTokenFormat(token) {
        // JWT tokens have 3 parts separated by dots
        const parts = token.split('.');
        return parts.length === 3;
    }
}
exports.AuthService = AuthService;
//# sourceMappingURL=AuthService.js.map