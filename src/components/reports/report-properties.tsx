import { ReportSnapshot } from '@/lib/types/reports';
import { MapPin, Users, Calendar, TrendingUp } from 'lucide-react';
import { REPORT_STATUS_LABELS } from '@/lib/reports-engine';

interface Props {
  snapshot: ReportSnapshot;
}

export function ReportProperties({ snapshot }: Props) {
  if (snapshot.properties.length === 0) return null;

  return (
    <div className="space-y-6 mt-8">
      <h3 className="text-xl font-bold text-white mb-2 print:text-gray-900 tracking-tight">Detalhes por Imóvel</h3>
      
      <div className="grid grid-cols-1 gap-6">
        {snapshot.properties.map((prop) => (
          <div key={prop.id} className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden print:border-gray-300 print:bg-white print:break-inside-avoid">
            
            <div className="flex flex-col sm:flex-row print:flex-row">
              {/* Image side */}
              <div className="w-full sm:w-1/3 bg-black/40 relative sm:min-h-[200px] border-b sm:border-b-0 sm:border-r border-white/10 print:border-gray-200">
                {prop.photoUrl ? (
                  <img src={prop.photoUrl} alt={prop.title} className="absolute inset-0 w-full h-full object-cover opacity-80" />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center text-sm text-gray-600">Sem Imagem</div>
                )}
                {prop.status === 'sold' && (
                  <div className="absolute top-3 right-3 bg-emerald-500 text-white text-xs font-bold px-2 py-1 rounded shadow-lg">
                    VENDIDO
                  </div>
                )}
              </div>

              {/* Info side */}
              <div className="w-full sm:w-2/3 p-6 flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-semibold px-2 py-0.5 rounded bg-white/10 text-gray-300 print:bg-gray-100 print:text-gray-800">{prop.code}</span>
                    <span className="text-xs font-medium text-emerald-400 tracking-wide print:text-emerald-700">
                      {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(prop.price)}
                    </span>
                  </div>
                  <h4 className="text-lg font-bold text-white mb-1 print:text-gray-900">{prop.title}</h4>
                  
                  <div className="flex items-center gap-1.5 text-xs text-gray-400 mb-4 print:text-gray-500">
                    <MapPin className="w-3.5 h-3.5" />
                    <span>{prop.neighborhood ? `${prop.neighborhood}, ${prop.city}` : 'Localização não cadastrada'}</span>
                    <span className="ml-2 text-gray-500 capitalize">• {prop.type}</span>
                  </div>
                </div>

                {/* Metrics */}
                <div className="grid grid-cols-3 gap-3 pt-4 border-t border-white/5 print:border-gray-100">
                   <div className="flex flex-col">
                      <span className="text-[10px] text-gray-500 uppercase flex items-center gap-1"><Users className="w-3 h-3 text-blue-400" /> Leads</span>
                      <span className="text-lg font-bold text-white print:text-gray-800">{prop.leadsCount}</span>
                   </div>
                   <div className="flex flex-col">
                      <span className="text-[10px] text-gray-500 uppercase flex items-center gap-1"><Calendar className="w-3 h-3 text-emerald-400" /> Visitas</span>
                      <span className="text-lg font-bold text-white print:text-gray-800">{prop.visitsCount}</span>
                   </div>
                   <div className="flex flex-col">
                      <span className="text-[10px] text-gray-500 uppercase flex items-center gap-1"><TrendingUp className="w-3 h-3 text-fuchsia-400" /> Conversão</span>
                      <span className="text-lg font-bold text-white print:text-gray-800">{prop.conversionRate.toFixed(1)}%</span>
                   </div>
                </div>

                {/* Funnel distribution row */}
                {Object.keys(prop.funnelDistribution).length > 0 && (
                  <div className="mt-4 pt-3 border-t border-white/5 print:border-gray-100">
                    <p className="text-[10px] text-gray-500 capitalize mb-1.5">Distribuição do funil:</p>
                    <div className="flex flex-wrap gap-1.5">
                      {Object.entries(prop.funnelDistribution).map(([status, count]) => (
                        <span key={status} className="text-[10px] font-medium bg-white/5 border border-white/10 px-1.5 py-0.5 rounded text-gray-300 print:bg-gray-100 print:text-gray-600 print:border-gray-200">
                          {REPORT_STATUS_LABELS[status]?.label || status}: <strong className="text-white print:text-black">{count}</strong>
                        </span>
                      ))}
                    </div>
                  </div>
                )}

              </div>
            </div>

          </div>
        ))}
      </div>
    </div>
  );
}
