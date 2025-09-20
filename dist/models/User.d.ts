import { Pool } from 'pg';
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
export declare class User {
    private pool;
    constructor(pool: Pool);
    create(userData: CreateUserData): Promise<UserData>;
    findById(id: string): Promise<UserData | null>;
    findByEmail(email: string): Promise<UserData | null>;
    findByEmailWithPassword(email: string): Promise<(UserData & {
        password_hash: string;
    }) | null>;
    update(id: string, updateData: UpdateUserData): Promise<UserData | null>;
    verifyPassword(password: string, hash: string): Promise<boolean>;
    emailExists(email: string): Promise<boolean>;
    delete(id: string): Promise<boolean>;
    static validateEmail(email: string): boolean;
    static validatePassword(password: string): {
        valid: boolean;
        message?: string;
    };
    static validateRole(role: string): boolean;
}
//# sourceMappingURL=User.d.ts.map