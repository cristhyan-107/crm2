import { ReportSnapshot } from '@/lib/types/reports';
import { ReportExecutiveSummary } from './report-executive-summary';
import { ReportIntelligence } from './report-intelligence';
import { ReportCharts } from './report-charts';
import { ReportProperties } from './report-properties';

interface Props {
  snapshot: ReportSnapshot;
}

export function ReportDashboard({ snapshot }: Props) {
  return (
    <div className="w-full space-y-8 print:space-y-6">
      <ReportExecutiveSummary snapshot={snapshot} />
      
      {snapshot.customNotes && (
        <div className="bg-white/5 border border-white/10 p-6 rounded-2xl print:border-gray-300 print:bg-white print:break-inside-avoid shadow-sm print:shadow-none">
          <h3 className="text-sm font-semibold text-gray-200 mb-2 print:text-gray-900">Resumo Executivo / Notas</h3>
          <p className="text-sm text-gray-400 whitespace-pre-wrap leading-relaxed print:text-gray-700">
            {snapshot.customNotes}
          </p>
        </div>
      )}

      <ReportIntelligence snapshot={snapshot} />
      <ReportCharts snapshot={snapshot} />
      <ReportProperties snapshot={snapshot} />
    </div>
  );
}
