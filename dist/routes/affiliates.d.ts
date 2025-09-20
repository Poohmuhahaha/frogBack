import { Router, Request } from 'express';
import { Pool } from 'pg';
export interface AuthRequest extends Request {
    user?: any;
}
export declare function createAffiliatesRouter(pool: Pool): Router;
//# sourceMappingURL=affiliates.d.ts.map