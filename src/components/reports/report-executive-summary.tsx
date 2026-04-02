import { ReportSnapshot } from '@/lib/types/reports';
import { Building2, Users, Calendar, TrendingUp, DollarSign } from 'lucide-react';

interface Props {
  snapshot: ReportSnapshot;
}

export function ReportExecutiveSummary({ snapshot }: Props) {
  const { globalStats } = snapshot;

  const metrics = [
    { label: 'Imóveis Analisados', value: globalStats.totalProperties, icon: Building2, color: 'text-blue-400', bg: 'bg-blue-400/10' },
    { label: 'Total de Leads', value: globalStats.totalLeads, icon: Users, color: 'text-indigo-400', bg: 'bg-indigo-400/10' },
    { label: 'Visitas Agendadas', value: globalStats.scheduledVisits, icon: Calendar, color: 'text-fuchsia-400', bg: 'bg-fuchsia-400/10' },
    { label: 'Vendas Realizadas', value: globalStats.sales, icon: DollarSign, color: 'text-emerald-400', bg: 'bg-emerald-400/10' },
    { label: 'Conversão Global', value: `${globalStats.conversionRate.toFixed(1)}%`, icon: TrendingUp, color: 'text-rose-400', bg: 'bg-rose-400/10' },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
      {metrics.map((metric, i) => (
        <div key={i} className="bg-white/5 border border-white/10 p-5 rounded-2xl flex flex-col items-center justify-center text-center group hover:bg-white/[0.07] transition-all print:border-gray-200 print:bg-white print:shadow-sm">
          <div className={`w-10 h-10 ${metric.bg} rounded-xl flex items-center justify-center mb-3 group-hover:scale-110 transition-transform`}>
            <metric.icon className={`w-5 h-5 ${metric.color}`} />
          </div>
          <p className="text-3xl font-bold text-white print:text-gray-900">{metric.value}</p>
          <p className="text-xs text-gray-400 uppercase tracking-widest mt-1 print:text-gray-500">{metric.label}</p>
        </div>
      ))}
    </div>
  );
}
