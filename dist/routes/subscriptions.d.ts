import { Router, Request } from 'express';
import { Pool } from 'pg';
export interface AuthRequest extends Request {
    user?: any;
}
export declare function createSubscriptionsRouter(pool: Pool): Router;
//# sourceMappingURL=subscriptions.d.ts.map