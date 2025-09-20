import { Pool } from 'pg';
export interface SubscriptionPlanData {
    id?: string;
    creator_id: string;
    name: string;
    description: string;
    price: number;
    currency: string;
    features: string[];
    is_active?: boolean;
    stripe_price_id?: string;
    created_at?: Date;
    updated_at?: Date;
}
export interface CreateSubscriptionPlanData {
    creator_id: string;
    name: string;
    description: string;
    price: number;
    currency: string;
    features: string[];
    stripe_price_id?: string;
}
export interface UpdateSubscriptionPlanData {
    name?: string;
    description?: string;
    features?: string[];
    is_active?: boolean;
    stripe_price_id?: string;
}
export interface SubscriptionPlanFilters {
    creator_id?: string;
    is_active?: boolean;
    currency?: string;
    price_min?: number;
    price_max?: number;
    limit?: number;
    offset?: number;
    search?: string;
}
export declare class SubscriptionPlan {
    private pool;
    constructor(pool: Pool);
    create(planData: CreateSubscriptionPlanData): Promise<SubscriptionPlanData>;
    findById(id: string): Promise<SubscriptionPlanData | null>;
    findByCreatorId(creatorId: string): Promise<SubscriptionPlanData[]>;
    findMany(filters?: SubscriptionPlanFilters): Promise<{
        plans: SubscriptionPlanData[];
        total: number;
    }>;
    findActive(): Promise<SubscriptionPlanData[]>;
    update(id: string, updateData: UpdateSubscriptionPlanData): Promise<SubscriptionPlanData | null>;
    activate(id: string): Promise<SubscriptionPlanData | null>;
    deactivate(id: string): Promise<SubscriptionPlanData | null>;
    updateStripeId(id: string, stripePriceId: string): Promise<SubscriptionPlanData | null>;
    getSubscriberCount(planId: string): Promise<number>;
    getMonthlyRevenue(planId: string): Promise<number>;
    delete(id: string): Promise<boolean>;
    hardDelete(id: string): Promise<boolean>;
    static validateName(name: string): boolean;
    static validateDescription(description: string): boolean;
    static validatePrice(price: number): boolean;
    static validateCurrency(currency: string): boolean;
    static validateFeatures(features: string[]): boolean;
    static formatPrice(priceInCents: number, currency: string): string;
    static calculateAnnualPrice(monthlyPriceInCents: number, discountPercent?: number): number;
}
//# sourceMappingURL=SubscriptionPlan.d.ts.map