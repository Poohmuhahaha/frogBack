import { Router, Request } from 'express';
import { Pool } from 'pg';
export interface AuthRequest extends Request {
    user?: any;
}
export declare function createAnalyticsRouter(pool: Pool): Router;
//# sourceMappingURL=analytics.d.ts.map