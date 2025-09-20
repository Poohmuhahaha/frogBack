import { Router, Request } from 'express';
import { Pool } from 'pg';
export interface AuthRequest extends Request {
    user?: any;
}
export declare function createArticlesRouter(pool: Pool): Router;
//# sourceMappingURL=articles.d.ts.map