import { ReportSnapshot } from '@/lib/types/reports';
import { Lightbulb, AlertTriangle } from 'lucide-react';

interface Props {
  snapshot: ReportSnapshot;
}

export function ReportIntelligence({ snapshot }: Props) {
  const { insights, alerts } = snapshot;

  if (insights.length === 0 && alerts.length === 0) return null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
      
      {/* Insights */}
      {insights.length > 0 && (
        <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-2xl p-6 print:border-green-200 print:bg-green-50 print:shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center">
              <Lightbulb className="w-4 h-4 text-emerald-400 print:text-emerald-600" />
            </div>
            <h3 className="text-lg font-semibold text-emerald-400 print:text-emerald-700">Insights Automáticos</h3>
          </div>
          <ul className="space-y-3">
            {insights.map((insight, idx) => (
              <li key={idx} className="flex items-start gap-2 text-sm text-gray-300 print:text-gray-800">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mt-1.5 shrink-0" />
                <span className="leading-relaxed">{insight}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Alertas */}
      {alerts.length > 0 && (
        <div className="bg-amber-500/5 border border-amber-500/20 rounded-2xl p-6 print:border-amber-200 print:bg-amber-50 print:shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-lg bg-amber-500/20 flex items-center justify-center">
              <AlertTriangle className="w-4 h-4 text-amber-500 print:text-amber-600" />
            </div>
            <h3 className="text-lg font-semibold text-amber-500 print:text-amber-700">Atenção e Oportunidades</h3>
          </div>
          <ul className="space-y-3">
            {alerts.map((alert, idx) => (
              <li key={idx} className="flex items-start gap-2 text-sm text-amber-200/80 print:text-amber-900">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 mt-1.5 shrink-0" />
                <span className="leading-relaxed">{alert}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

    </div>
  );
}
