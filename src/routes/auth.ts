import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import { AuthService } from '../services/AuthService';
import { User } from '../models/User';

export interface AuthRequest extends Request {
  user?: any;
}

export function createAuthRouter(pool: Pool): Router {
  const router = Router();
  const authService = new AuthService(pool);

  // Middleware to authenticate JWT tokens
  const authenticateToken = async (req: AuthRequest, res: Response, next: any) => {
    try {
      const authHeader = req.headers.authorization;
      const token = AuthService.extractTokenFromHeader(authHeader);

      if (!token) {
        return res.status(401).json({ error: 'Access token required' });
      }

      if (!AuthService.isValidTokenFormat(token)) {
        return res.status(401).json({ error: 'Invalid token format' });
      }

      const user = await authService.getUserFromToken(token);
      req.user = user;
      next();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Invalid token';
      res.status(401).json({ error: message });
    }
  };

  // POST /api/auth/register - User registration
  router.post('/register', async (req: Request, res: Response) => {
    try {
      const { email, password, name, role = 'creator' } = req.body;

      // Validate required fields
      if (!email || !password || !name) {
        return res.status(400).json({
          error: 'Email, password, and name are required'
        });
      }

      // Validate email format
      if (!User.validateEmail(email)) {
        return res.status(400).json({
          error: 'Invalid email format'
        });
      }

      // Validate password strength
      const passwordValidation = User.validatePassword(password);
      if (!passwordValidation.valid) {
        return res.status(400).json({
          error: passwordValidation.message
        });
      }

      // Validate role
      if (!User.validateRole(role)) {
        return res.status(400).json({
          error: 'Invalid role. Must be creator, subscriber, or admin'
        });
      }

      // Register user
      const result = await authService.register({
        email: email.toLowerCase().trim(),
        password,
        name: name.trim(),
        role
      });

      res.status(201).json({
        message: 'User registered successfully',
        user: result.user,
        token: result.token
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Registration failed';

      // Handle specific error cases
      if (message.includes('already registered') || message.includes('already exists')) {
        return res.status(409).json({ error: message });
      }

      console.error('Registration error:', error);
      res.status(500).json({ error: message });
    }
  });

  // POST /api/auth/login - User login
  router.post('/login', async (req: Request, res: Response) => {
    try {
      const { email, password } = req.body;

      // Validate required fields
      if (!email || !password) {
        return res.status(400).json({
          error: 'Email and password are required'
        });
      }

      // Attempt login
      const result = await authService.login({
        email: email.toLowerCase().trim(),
        password
      });

      res.json({
        message: 'Login successful',
        user: result.user,
        token: result.token
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Login failed';

      // Handle authentication errors
      if (message.includes('Invalid email or password')) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      console.error('Login error:', error);
      res.status(500).json({ error: 'Login failed' });
    }
  });

  // GET /api/auth/me - Get current user profile
  router.get('/me', authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      // Return user profile (password hash already excluded by sanitizeUser)
      res.json({
        user: req.user
      });
    } catch (error) {
      console.error('Get profile error:', error);
      res.status(500).json({ error: 'Failed to get user profile' });
    }
  });

  // POST /api/auth/refresh - Refresh access token
  router.post('/refresh', async (req: Request, res: Response) => {
    try {
      const { token } = req.body;

      if (!token) {
        return res.status(400).json({ error: 'Refresh token required' });
      }

      const newToken = await authService.refreshToken(token);

      res.json({
        message: 'Token refreshed successfully',
        token: newToken
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Token refresh failed';

      if (message.includes('Invalid token') || message.includes('expired')) {
        return res.status(401).json({ error: message });
      }

      console.error('Token refresh error:', error);
      res.status(500).json({ error: 'Token refresh failed' });
    }
  });

  // POST /api/auth/verify-email - Verify user email
  router.post('/verify-email', authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      const updatedUser = await authService.verifyEmail(req.user.id);

      res.json({
        message: 'Email verified successfully',
        user: updatedUser
      });
    } catch (error) {
      console.error('Email verification error:', error);
      res.status(500).json({ error: 'Email verification failed' });
    }
  });

  // POST /api/auth/forgot-password - Request password reset
  router.post('/forgot-password', async (req: Request, res: Response) => {
    try {
      const { email } = req.body;

      if (!email) {
        return res.status(400).json({ error: 'Email is required' });
      }

      if (!User.validateEmail(email)) {
        return res.status(400).json({ error: 'Invalid email format' });
      }

      const resetToken = await authService.requestPasswordReset(email.toLowerCase().trim());

      // In production, you would send this token via email
      // For now, we'll return it in the response (not recommended for production)
      res.json({
        message: 'Password reset token generated',
        resetToken // Remove this in production
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Password reset request failed';

      if (message.includes('User not found')) {
        // For security, don't reveal if email exists
        return res.json({
          message: 'If the email exists, a password reset link has been sent'
        });
      }

      console.error('Password reset request error:', error);
      res.status(500).json({ error: 'Password reset request failed' });
    }
  });

  // POST /api/auth/reset-password - Reset password with token
  router.post('/reset-password', async (req: Request, res: Response) => {
    try {
      const { resetToken, newPassword } = req.body;

      if (!resetToken || !newPassword) {
        return res.status(400).json({
          error: 'Reset token and new password are required'
        });
      }

      // Validate new password
      const passwordValidation = User.validatePassword(newPassword);
      if (!passwordValidation.valid) {
        return res.status(400).json({
          error: passwordValidation.message
        });
      }

      await authService.resetPassword(resetToken, newPassword);

      res.json({
        message: 'Password reset successful'
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Password reset failed';

      if (message.includes('Invalid') || message.includes('expired')) {
        return res.status(400).json({ error: message });
      }

      console.error('Password reset error:', error);
      res.status(500).json({ error: 'Password reset failed' });
    }
  });

  // POST /api/auth/logout - Logout (client-side token removal)
  router.post('/logout', authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      // Since we're using stateless JWT tokens, logout is handled client-side
      // In a production system, you might want to implement token blacklisting
      res.json({
        message: 'Logged out successfully'
      });
    } catch (error) {
      console.error('Logout error:', error);
      res.status(500).json({ error: 'Logout failed' });
    }
  });

  // PUT /api/auth/profile - Update user profile
  router.put('/profile', authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      const { name, bio, avatar_url } = req.body;
      const user = new User(pool);

      const updateData: any = {};
      if (name !== undefined) updateData.name = name.trim();
      if (bio !== undefined) updateData.bio = bio.trim();
      if (avatar_url !== undefined) updateData.avatar_url = avatar_url.trim();

      if (Object.keys(updateData).length === 0) {
        return res.status(400).json({ error: 'No valid fields to update' });
      }

      const updatedUser = await user.update(req.user.id, updateData);

      if (!updatedUser) {
        return res.status(404).json({ error: 'User not found' });
      }

      res.json({
        message: 'Profile updated successfully',
        user: updatedUser
      });
    } catch (error) {
      console.error('Profile update error:', error);
      res.status(500).json({ error: 'Profile update failed' });
    }
  });

  // GET /api/auth/validate - Validate token (for frontend auth checks)
  router.get('/validate', authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      res.json({
        valid: true,
        user: req.user
      });
    } catch (error) {
      res.status(401).json({
        valid: false,
        error: 'Invalid token'
      });
    }
  });

  return router;
}