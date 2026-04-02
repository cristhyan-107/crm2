import { SupabaseClient } from '@supabase/supabase-js';
import { ReportSnapshot, ReportConfig, PropertyReportStats, ReportFunnelStage, ReportLeadsEvolution } from './types/reports';

export const REPORT_STATUS_LABELS: Record<string, { label: string, fill: string }> = {
  new: { label: 'Novos', fill: '#3b82f6' },
  contact_attempt: { label: 'Tentativa de Contato', fill: '#8b5cf6' },
  contacted: { label: 'Em Contato', fill: '#a855f7' },
  qualified: { label: 'Qualificado', fill: '#d946ef' },
  credit_approved: { label: 'Com Crédito', fill: '#22c55e' },
  scheduled_visit: { label: 'Agendado', fill: '#6366f1' },
  visited: { label: 'Visitou', fill: '#f97316' },
  proposal: { label: 'Proposta', fill: '#eab308' },
  negotiating: { label: 'Negociando', fill: '#ec4899' },
  closed: { label: 'Fechado', fill: '#14b8a6' },
  lost: { label: 'Perdido', fill: '#ef4444' },
};

export const FUNNEL_ORDER = [
  'new', 'contact_attempt', 'contacted', 'qualified', 'credit_approved',
  'scheduled_visit', 'visited', 'proposal', 'negotiating', 'closed', 'lost'
];

export async function generateReportSnapshot(
  supabase: SupabaseClient,
  config: ReportConfig
): Promise<ReportSnapshot> {
  const { propertyIds, startDate, endDate } = config;

  if (!propertyIds || propertyIds.length === 0) {
    throw new Error('Nenhum imóvel selecionado.');
  }

  // 1. Iniciar Queries
  let propertiesQuery = supabase.from('properties').select('*').in('id', propertyIds);
  let leadsQuery = supabase.from('leads').select('*').in('property_id', propertyIds);
  let visitsQuery = supabase.from('visits').select('*').in('property_id', propertyIds);

  if (startDate) {
    leadsQuery = leadsQuery.gte('created_at', startDate);
    visitsQuery = visitsQuery.gte('created_at', startDate);
  }
  if (endDate) {
    // Adicionar 1 dia para pegar até o fim do dia
    const end = new Date(endDate);
    end.setDate(end.getDate() + 1);
    leadsQuery = leadsQuery.lt('created_at', end.toISOString());
    visitsQuery = visitsQuery.lt('created_at', end.toISOString());
  }

  const [propertiesRes, leadsRes, visitsRes] = await Promise.all([
    propertiesQuery,
    leadsQuery,
    visitsQuery
  ]);

  const properties = propertiesRes.data || [];
  const leads = leadsRes.data || [];
  const visits = visitsRes.data || [];

  // Cálculos globais
  const totalLeads = leads.length;
  const scheduledVisits = visits.filter(v => v.status === 'scheduled').length;
  const sales = leads.filter(l => l.status === 'closed').length;
  const conversionRate = totalLeads > 0 ? (sales / totalLeads) * 100 : 0;

  // Funnel Data (Global)
  const statusCounts: Record<string, number> = {};
  leads.forEach(l => {
    statusCounts[l.status] = (statusCounts[l.status] || 0) + 1;
  });

  const funnelData: ReportFunnelStage[] = FUNNEL_ORDER.map(status => ({
    name: REPORT_STATUS_LABELS[status]?.label || status,
    value: statusCounts[status] || 0,
    fill: REPORT_STATUS_LABELS[status]?.fill || '#64748b'
  })).filter(s => s.value > 0);

  // Evolução de leads por dia
  const evolutionMap: Record<string, number> = {};
  leads.forEach(l => {
    const date = new Date(l.created_at).toISOString().split('T')[0];
    evolutionMap[date] = (evolutionMap[date] || 0) + 1;
  });
  const leadsEvolution: ReportLeadsEvolution[] = Object.entries(evolutionMap)
    .sort(([dateA], [dateB]) => dateA.localeCompare(dateB))
    .map(([date, count]) => ({ date: date.split('-').reverse().join('/'), count }));

  // Propriedades Detalhadas
  const propertyStats: PropertyReportStats[] = properties.map(prop => {
    const propLeads = leads.filter(l => l.property_id === prop.id);
    const propVisits = visits.filter(v => v.property_id === prop.id);
    
    const propSales = propLeads.filter(l => l.status === 'closed').length;
    const propConversion = propLeads.length > 0 ? (propSales / propLeads.length) * 100 : 0;
    
    const propFunnel: Record<string, number> = {};
    propLeads.forEach(l => {
      propFunnel[l.status] = (propFunnel[l.status] || 0) + 1;
    });

    return {
      id: prop.id,
      code: prop.code,
      title: prop.title,
      type: prop.type,
      status: prop.status,
      price: prop.price,
      address: prop.address,
      neighborhood: prop.neighborhood,
      city: prop.city,
      photoUrl: prop.images && prop.images.length > 0 ? prop.images[0] : undefined,
      leadsCount: propLeads.length,
      visitsCount: propVisits.length,
      conversionRate: propConversion,
      funnelDistribution: propFunnel,
    };
  });

  // Geração de Insights e Alertas
  const insights: string[] = [];
  const alerts: string[] = [];

  // Insight 1: Imóvel com melhor conversão
  const propsWithLeads = propertyStats.filter(p => p.leadsCount > 0);
  if (propsWithLeads.length > 0) {
    const bestConv = propsWithLeads.reduce((max, p) => p.conversionRate > max.conversionRate ? p : max, propsWithLeads[0]);
    if (bestConv.conversionRate > 0) {
      insights.push(`O imóvel "${bestConv.title}" apresenta a melhor performance de conversão (${bestConv.conversionRate.toFixed(1)}%).`);
    } else {
      alerts.push(`Baixa conversão no período: Nenhuma venda registrada entre os leads pesquisados.`);
    }

    // Alerta: Alta demanda, sem conversão
    const highDemandNoConv = propsWithLeads.filter(p => p.leadsCount > 10 && p.conversionRate === 0);
    highDemandNoConv.forEach(p => {
      alerts.push(`O imóvel "${p.title}" possui alta demanda (${p.leadsCount} leads) mas nenhuma conversão registrada.`);
    });
  }

  // Alerta: Imóveis sem leads
  const zeroLeadsProps = propertyStats.filter(p => p.leadsCount === 0);
  if (zeroLeadsProps.length === propertyStats.length && propertyStats.length > 0) {
      alerts.push(`Nenhum dos imóveis selecionados gerou leads no período configurado.`);
  } else {
      zeroLeadsProps.forEach(p => {
        alerts.push(`O imóvel "${p.title}" não obteve nenhum registro de lead no período.`);
      });
  }

  // Alerta: Leads travados na etapa de Contato/Sem ação.
  const contactedButStuckCount = leads.filter(l => l.status === 'new' || l.status === 'contact_attempt' || l.status === 'contacted').length;
  if (contactedButStuckCount > 0) {
    const percentage = ((contactedButStuckCount / totalLeads) * 100).toFixed(0);
    if (Number(percentage) > 50) {
      alerts.push(`${percentage}% dos leads estão parados nas etapas iniciais (Novos / Em Contato). Priorize o atendimento para evitar perdas.`);
    }
  }

  if (sales > 0) {
    insights.push(`Foram registradas ${sales} vendas no período configurado.`);
  }

  return {
    globalStats: {
      totalProperties: properties.length,
      totalLeads,
      scheduledVisits,
      sales,
      conversionRate
    },
    funnelData,
    leadsEvolution,
    properties: propertyStats.sort((a,b) => b.leadsCount - a.leadsCount),
    insights,
    alerts
  };
}
