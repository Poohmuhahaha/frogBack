import { Pool } from 'pg';
export interface AffiliateLinkData {
    id?: string;
    creator_id: string;
    name: string;
    original_url: string;
    tracking_code?: string;
    network: 'amazon' | 'shareasale' | 'cj' | 'custom';
    commission_rate?: number;
    category?: string;
    is_active?: boolean;
    created_at?: Date;
}
export interface CreateAffiliateLinkData {
    creator_id: string;
    name: string;
    original_url: string;
    network: 'amazon' | 'shareasale' | 'cj' | 'custom';
    commission_rate?: number;
    category?: string;
}
export interface UpdateAffiliateLinkData {
    name?: string;
    original_url?: string;
    commission_rate?: number;
    category?: string;
    is_active?: boolean;
}
export interface AffiliateLinkFilters {
    creator_id?: string;
    network?: 'amazon' | 'shareasale' | 'cj' | 'custom';
    category?: string;
    is_active?: boolean;
    limit?: number;
    offset?: number;
    search?: string;
}
export interface AffiliateLinkPerformance {
    link_id: string;
    link_name: string;
    total_clicks: number;
    unique_clicks: number;
    conversions: number;
    conversion_rate: number;
    total_commission: number;
    avg_commission_per_conversion: number;
}
export declare class AffiliateLink {
    private pool;
    constructor(pool: Pool);
    create(linkData: CreateAffiliateLinkData): Promise<AffiliateLinkData>;
    findById(id: string): Promise<AffiliateLinkData | null>;
    findByTrackingCode(trackingCode: string): Promise<AffiliateLinkData | null>;
    findByCreatorId(creatorId: string): Promise<AffiliateLinkData[]>;
    findMany(filters?: AffiliateLinkFilters): Promise<{
        links: AffiliateLinkData[];
        total: number;
    }>;
    findActive(): Promise<AffiliateLinkData[]>;
    update(id: string, updateData: UpdateAffiliateLinkData): Promise<AffiliateLinkData | null>;
    activate(id: string): Promise<AffiliateLinkData | null>;
    deactivate(id: string): Promise<AffiliateLinkData | null>;
    getPerformance(linkId: string, days?: number): Promise<AffiliateLinkPerformance | null>;
    getTopPerformingLinks(creatorId: string, limit?: number, days?: number): Promise<AffiliateLinkPerformance[]>;
    getTotalCommission(creatorId: string, days?: number): Promise<number>;
    getClickCount(linkId: string, days?: number): Promise<number>;
    getUniqueClickCount(linkId: string, days?: number): Promise<number>;
    regenerateTrackingCode(id: string): Promise<AffiliateLinkData | null>;
    delete(id: string): Promise<boolean>;
    hardDelete(id: string): Promise<boolean>;
    private generateTrackingCode;
    buildTrackedUrl(baseUrl: string, trackingCode: string): string;
    static validateName(name: string): boolean;
    static validateUrl(url: string): boolean;
    static validateNetwork(network: string): boolean;
    static validateCommissionRate(rate: number): boolean;
    static validateCategory(category: string): boolean;
    static extractDomain(url: string): string;
    static isTrackingCodeUnique(trackingCode: string, existingCodes: string[]): boolean;
}
//# sourceMappingURL=AffiliateLink.d.ts.map