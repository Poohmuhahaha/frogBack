import { Pool } from 'pg';
import { UserData, CreateUserData } from '../models/User';
export interface LoginCredentials {
    email: string;
    password: string;
}
export interface RegisterData extends CreateUserData {
}
export interface AuthResponse {
    user: Omit<UserData, 'password_hash'>;
    token: string;
}
export interface JWTPayload {
    userId: string;
    email: string;
    role: string;
}
export declare class AuthService {
    private user;
    private jwtSecret;
    private jwtExpiresIn;
    constructor(pool: Pool, jwtSecret?: string, jwtExpiresIn?: string);
    register(registerData: RegisterData): Promise<AuthResponse>;
    login(credentials: LoginCredentials): Promise<AuthResponse>;
    getUserFromToken(token: string): Promise<UserData>;
    refreshToken(token: string): Promise<string>;
    verifyEmail(userId: string): Promise<UserData>;
    requestPasswordReset(email: string): Promise<string>;
    resetPassword(resetToken: string, newPassword: string): Promise<void>;
    private generateToken;
    private sanitizeUser;
    static extractTokenFromHeader(authHeader?: string): string | null;
    static isValidTokenFormat(token: string): boolean;
}
//# sourceMappingURL=AuthService.d.ts.map