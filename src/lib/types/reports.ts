export interface ReportFunnelStage {
  name: string;
  value: number;
  fill: string;
}

export interface ReportLeadsEvolution {
  date: string;
  count: number;
}

export interface PropertyReportStats {
  id: string;
  code: string;
  title: string;
  type: string;
  status: string;
  price: number;
  address?: string;
  neighborhood?: string;
  city?: string;
  photoUrl?: string;
  leadsCount: number;
  visitsCount: number;
  conversionRate: number;
  funnelDistribution: Record<string, number>;
}

export interface ReportGlobalStats {
  totalProperties: number;
  totalLeads: number;
  scheduledVisits: number;
  sales: number;
  conversionRate: number;
}

export interface ReportSnapshot {
  globalStats: ReportGlobalStats;
  funnelData: ReportFunnelStage[];
  leadsEvolution: ReportLeadsEvolution[];
  properties: PropertyReportStats[];
  insights: string[];
  alerts: string[];
  customNotes?: string;
}

export interface ReportConfig {
  propertyIds: string[];
  startDate?: string;
  endDate?: string;
}
