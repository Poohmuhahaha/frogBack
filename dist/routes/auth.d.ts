import { Router, Request } from 'express';
import { Pool } from 'pg';
export interface AuthRequest extends Request {
    user?: any;
}
export declare function createAuthRouter(pool: Pool): Router;
//# sourceMappingURL=auth.d.ts.map