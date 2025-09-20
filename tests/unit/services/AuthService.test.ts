import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { AuthService } from '../../../src/services/AuthService';
import database from '../../../src/database/connection';

jest.mock('../../../src/database/connection');
jest.mock('bcrypt');
jest.mock('jsonwebtoken');

const mockDatabase = database as jest.Mocked<typeof database>;
const mockBcrypt = bcrypt as jest.Mocked<typeof bcrypt>;
const mockJwt = jwt as jest.Mocked<typeof jwt>;

describe('AuthService', () => {
  let authService: AuthService;

  beforeEach(() => {
    authService = new AuthService();
    jest.clearAllMocks();

    // Mock environment variables
    process.env.JWT_SECRET = 'test-secret';
    process.env.JWT_EXPIRES_IN = '24h';
    process.env.BCRYPT_ROUNDS = '10';
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('register', () => {
    const mockUserData = {
      name: 'John Doe',
      email: 'john@example.com',
      password: 'password123',
      role: 'creator' as const
    };

    it('should successfully register a new user', async () => {
      const hashedPassword = 'hashed_password';
      const userId = 'user_123';
      const mockUser = {
        id: userId,
        name: mockUserData.name,
        email: mockUserData.email,
        role: mockUserData.role,
        email_verified: false,
        created_at: new Date(),
        updated_at: new Date()
      };

      mockBcrypt.hash.mockResolvedValue(hashedPassword as never);
      mockDatabase.query
        .mockResolvedValueOnce({ rows: [] }) // Check existing user
        .mockResolvedValueOnce({ rows: [mockUser] }); // Insert new user

      const result = await authService.register(mockUserData);

      expect(mockBcrypt.hash).toHaveBeenCalledWith(mockUserData.password, 10);
      expect(mockDatabase.query).toHaveBeenCalledTimes(2);
      expect(result).toEqual({
        id: userId,
        name: mockUserData.name,
        email: mockUserData.email,
        role: mockUserData.role,
        emailVerified: false
      });
    });

    it('should throw error if user already exists', async () => {
      mockDatabase.query.mockResolvedValueOnce({
        rows: [{ email: mockUserData.email }]
      });

      await expect(authService.register(mockUserData)).rejects.toThrow('User already exists');
      expect(mockBcrypt.hash).not.toHaveBeenCalled();
    });

    it('should throw error for invalid email format', async () => {
      const invalidUserData = { ...mockUserData, email: 'invalid-email' };

      await expect(authService.register(invalidUserData)).rejects.toThrow('Invalid email format');
    });

    it('should throw error for weak password', async () => {
      const weakPasswordData = { ...mockUserData, password: '123' };

      await expect(authService.register(weakPasswordData)).rejects.toThrow('Password must be at least 8 characters');
    });
  });

  describe('login', () => {
    const loginData = {
      email: 'john@example.com',
      password: 'password123'
    };

    const mockUser = {
      id: 'user_123',
      name: 'John Doe',
      email: loginData.email,
      password: 'hashed_password',
      role: 'creator',
      email_verified: true
    };

    it('should successfully login with valid credentials', async () => {
      const mockToken = 'jwt_token';

      mockDatabase.query.mockResolvedValueOnce({ rows: [mockUser] });
      mockBcrypt.compare.mockResolvedValue(true as never);
      mockJwt.sign.mockReturnValue(mockToken as never);

      const result = await authService.login(loginData);

      expect(mockDatabase.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT'),
        [loginData.email]
      );
      expect(mockBcrypt.compare).toHaveBeenCalledWith(loginData.password, mockUser.password);
      expect(mockJwt.sign).toHaveBeenCalledWith(
        {
          id: mockUser.id,
          email: mockUser.email,
          role: mockUser.role,
          emailVerified: mockUser.email_verified
        },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN }
      );
      expect(result).toEqual({
        user: {
          id: mockUser.id,
          name: mockUser.name,
          email: mockUser.email,
          role: mockUser.role,
          emailVerified: mockUser.email_verified
        },
        token: mockToken
      });
    });

    it('should throw error for non-existent user', async () => {
      mockDatabase.query.mockResolvedValueOnce({ rows: [] });

      await expect(authService.login(loginData)).rejects.toThrow('Invalid credentials');
      expect(mockBcrypt.compare).not.toHaveBeenCalled();
    });

    it('should throw error for incorrect password', async () => {
      mockDatabase.query.mockResolvedValueOnce({ rows: [mockUser] });
      mockBcrypt.compare.mockResolvedValue(false as never);

      await expect(authService.login(loginData)).rejects.toThrow('Invalid credentials');
      expect(mockJwt.sign).not.toHaveBeenCalled();
    });

    it('should throw error for unverified email', async () => {
      const unverifiedUser = { ...mockUser, email_verified: false };
      mockDatabase.query.mockResolvedValueOnce({ rows: [unverifiedUser] });
      mockBcrypt.compare.mockResolvedValue(true as never);

      await expect(authService.login(loginData)).rejects.toThrow('Email not verified');
    });
  });

  describe('verifyToken', () => {
    const mockToken = 'valid_jwt_token';
    const mockPayload = {
      id: 'user_123',
      email: 'john@example.com',
      role: 'creator',
      emailVerified: true
    };

    it('should successfully verify valid token', async () => {
      mockJwt.verify.mockReturnValue(mockPayload as never);

      const result = await authService.verifyToken(mockToken);

      expect(mockJwt.verify).toHaveBeenCalledWith(mockToken, process.env.JWT_SECRET);
      expect(result).toEqual(mockPayload);
    });

    it('should throw error for invalid token', async () => {
      mockJwt.verify.mockImplementation(() => {
        throw new Error('Invalid token');
      });

      await expect(authService.verifyToken('invalid_token')).rejects.toThrow('Invalid token');
    });

    it('should throw error for expired token', async () => {
      mockJwt.verify.mockImplementation(() => {
        const error = new Error('Token expired');
        error.name = 'TokenExpiredError';
        throw error;
      });

      await expect(authService.verifyToken(mockToken)).rejects.toThrow('Token expired');
    });
  });

  describe('requestPasswordReset', () => {
    const email = 'john@example.com';
    const mockUser = {
      id: 'user_123',
      email: email,
      name: 'John Doe'
    };

    it('should successfully create password reset request', async () => {
      const mockToken = 'reset_token';
      mockDatabase.query.mockResolvedValueOnce({ rows: [mockUser] });
      mockDatabase.query.mockResolvedValueOnce({ rows: [] }); // Insert reset token
      mockJwt.sign.mockReturnValue(mockToken as never);

      const result = await authService.requestPasswordReset(email);

      expect(mockDatabase.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT'),
        [email]
      );
      expect(mockJwt.sign).toHaveBeenCalledWith(
        { userId: mockUser.id, type: 'password_reset' },
        process.env.JWT_SECRET,
        { expiresIn: '1h' }
      );
      expect(result).toEqual({ resetToken: mockToken });
    });

    it('should throw error for non-existent user', async () => {
      mockDatabase.query.mockResolvedValueOnce({ rows: [] });

      await expect(authService.requestPasswordReset(email)).rejects.toThrow('User not found');
    });
  });

  describe('resetPassword', () => {
    const resetData = {
      token: 'reset_token',
      newPassword: 'newpassword123'
    };

    const mockTokenPayload = {
      userId: 'user_123',
      type: 'password_reset'
    };

    it('should successfully reset password with valid token', async () => {
      const hashedPassword = 'hashed_new_password';

      mockJwt.verify.mockReturnValue(mockTokenPayload as never);
      mockDatabase.query
        .mockResolvedValueOnce({ rows: [{ id: 'token_id' }] }) // Check token exists
        .mockResolvedValueOnce({ rows: [] }) // Update password
        .mockResolvedValueOnce({ rows: [] }); // Delete reset token
      mockBcrypt.hash.mockResolvedValue(hashedPassword as never);

      await authService.resetPassword(resetData);

      expect(mockJwt.verify).toHaveBeenCalledWith(resetData.token, process.env.JWT_SECRET);
      expect(mockBcrypt.hash).toHaveBeenCalledWith(resetData.newPassword, 10);
      expect(mockDatabase.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE users'),
        [hashedPassword, mockTokenPayload.userId]
      );
    });

    it('should throw error for invalid reset token', async () => {
      mockJwt.verify.mockImplementation(() => {
        throw new Error('Invalid token');
      });

      await expect(authService.resetPassword(resetData)).rejects.toThrow('Invalid reset token');
    });

    it('should throw error for expired reset token', async () => {
      mockJwt.verify.mockReturnValue(mockTokenPayload as never);
      mockDatabase.query.mockResolvedValueOnce({ rows: [] }); // Token not found in DB

      await expect(authService.resetPassword(resetData)).rejects.toThrow('Reset token not found or expired');
    });
  });

  describe('verifyEmail', () => {
    const verificationToken = 'verification_token';
    const mockTokenPayload = {
      userId: 'user_123',
      type: 'email_verification'
    };

    it('should successfully verify email with valid token', async () => {
      mockJwt.verify.mockReturnValue(mockTokenPayload as never);
      mockDatabase.query
        .mockResolvedValueOnce({ rows: [{ id: 'token_id' }] }) // Check token exists
        .mockResolvedValueOnce({ rows: [] }) // Update email_verified
        .mockResolvedValueOnce({ rows: [] }); // Delete verification token

      await authService.verifyEmail(verificationToken);

      expect(mockJwt.verify).toHaveBeenCalledWith(verificationToken, process.env.JWT_SECRET);
      expect(mockDatabase.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE users'),
        [mockTokenPayload.userId]
      );
    });

    it('should throw error for invalid verification token', async () => {
      mockJwt.verify.mockImplementation(() => {
        throw new Error('Invalid token');
      });

      await expect(authService.verifyEmail(verificationToken)).rejects.toThrow('Invalid verification token');
    });
  });

  describe('changePassword', () => {
    const passwordData = {
      userId: 'user_123',
      currentPassword: 'oldpassword123',
      newPassword: 'newpassword123'
    };

    const mockUser = {
      id: passwordData.userId,
      password: 'hashed_old_password'
    };

    it('should successfully change password with correct current password', async () => {
      const hashedNewPassword = 'hashed_new_password';

      mockDatabase.query.mockResolvedValueOnce({ rows: [mockUser] });
      mockBcrypt.compare.mockResolvedValue(true as never);
      mockBcrypt.hash.mockResolvedValue(hashedNewPassword as never);
      mockDatabase.query.mockResolvedValueOnce({ rows: [] }); // Update password

      await authService.changePassword(passwordData);

      expect(mockBcrypt.compare).toHaveBeenCalledWith(passwordData.currentPassword, mockUser.password);
      expect(mockBcrypt.hash).toHaveBeenCalledWith(passwordData.newPassword, 10);
      expect(mockDatabase.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE users'),
        [hashedNewPassword, passwordData.userId]
      );
    });

    it('should throw error for incorrect current password', async () => {
      mockDatabase.query.mockResolvedValueOnce({ rows: [mockUser] });
      mockBcrypt.compare.mockResolvedValue(false as never);

      await expect(authService.changePassword(passwordData)).rejects.toThrow('Current password is incorrect');
    });

    it('should throw error for non-existent user', async () => {
      mockDatabase.query.mockResolvedValueOnce({ rows: [] });

      await expect(authService.changePassword(passwordData)).rejects.toThrow('User not found');
    });
  });

  describe('getUserProfile', () => {
    const userId = 'user_123';
    const mockUser = {
      id: userId,
      name: 'John Doe',
      email: 'john@example.com',
      role: 'creator',
      email_verified: true,
      created_at: new Date(),
      updated_at: new Date()
    };

    it('should successfully retrieve user profile', async () => {
      mockDatabase.query.mockResolvedValueOnce({ rows: [mockUser] });

      const result = await authService.getUserProfile(userId);

      expect(mockDatabase.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT'),
        [userId]
      );
      expect(result).toEqual({
        id: mockUser.id,
        name: mockUser.name,
        email: mockUser.email,
        role: mockUser.role,
        emailVerified: mockUser.email_verified,
        createdAt: mockUser.created_at,
        updatedAt: mockUser.updated_at
      });
    });

    it('should throw error for non-existent user', async () => {
      mockDatabase.query.mockResolvedValueOnce({ rows: [] });

      await expect(authService.getUserProfile(userId)).rejects.toThrow('User not found');
    });
  });

  describe('refreshToken', () => {
    const oldToken = 'old_jwt_token';
    const mockPayload = {
      id: 'user_123',
      email: 'john@example.com',
      role: 'creator',
      emailVerified: true
    };

    it('should successfully refresh valid token', async () => {
      const newToken = 'new_jwt_token';

      mockJwt.verify.mockReturnValue(mockPayload as never);
      mockJwt.sign.mockReturnValue(newToken as never);

      const result = await authService.refreshToken(oldToken);

      expect(mockJwt.verify).toHaveBeenCalledWith(oldToken, process.env.JWT_SECRET);
      expect(mockJwt.sign).toHaveBeenCalledWith(
        mockPayload,
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN }
      );
      expect(result).toEqual({ token: newToken });
    });

    it('should throw error for invalid token', async () => {
      mockJwt.verify.mockImplementation(() => {
        throw new Error('Invalid token');
      });

      await expect(authService.refreshToken(oldToken)).rejects.toThrow('Invalid token');
    });
  });
});