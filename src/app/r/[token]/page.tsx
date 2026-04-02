import { createClient } from '@supabase/supabase-js';
import { notFound } from 'next/navigation';
import { PdfButton } from '@/components/reports/pdf-button';
import { ShareButton } from '@/components/reports/share-button';
import { ReportDashboard } from '@/components/reports/report-dashboard';
import { ReportSnapshot } from '@/lib/types/reports';
import { Building2 } from 'lucide-react';

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }) {
  return {
    title: `Relatório Analítico - Leilão Ágil`,
  };
}

export default async function PublicReportPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseKey) {
    console.warn('WARNING: SUPABASE_SERVICE_ROLE_KEY is not set. Falling back to ANON key.');
  }

  // Create an admin client to bypass RLS for public shared reports
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    supabaseKey || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const { data: report } = await supabaseAdmin
    .from('reports')
    .select('*') // Puxa agora o snapshot
    .eq('public_token', token)
    .maybeSingle();

  if (!report) {
    notFound();
  }

  let snapshot: ReportSnapshot | null = null;
  const isLegacy = !report.snapshot || Object.keys(report.snapshot).length === 0;

  if (!isLegacy) {
    snapshot = report.snapshot as ReportSnapshot;
  }

  return (
    <div className="min-h-screen bg-[#030816] print:bg-white flex flex-col items-center py-12 px-4 selection:bg-blue-500/30 selection:text-white pb-24">
      <div id="report-content" className="w-full max-w-5xl space-y-8 animate-fade-in print:space-y-6">
        
        {/* Header Superior Dinâmico */}
        <div className="flex flex-col md:flex-row items-center justify-between text-center md:text-left gap-6 p-6 md:p-8 bg-white/5 border border-white/10 rounded-2xl print:bg-white print:border-gray-200 print:shadow-sm">
          <div className="flex flex-col md:flex-row items-center gap-6">
             <div className="w-16 h-16 bg-blue-500/10 rounded-2xl flex items-center justify-center shadow-[0_0_30px_rgba(59,130,246,0.2)] print:border print:border-blue-200">
               <Building2 className="w-8 h-8 text-blue-500" />
             </div>
             <div>
                <h1 className="text-3xl font-bold text-white tracking-tight print:text-black">Relatório Estratégico</h1>
                <p className="text-gray-400 mt-1 print:text-gray-500">
                  Gerado em {new Date(report.created_at).toLocaleDateString('pt-BR')}
                </p>
             </div>
          </div>
          
          <div className="flex items-center gap-3 print:hidden">
            <ShareButton token={token} />
            <PdfButton filename={`relatorio-${token}`} />
          </div>
        </div>

        {/* Renderização condicional: Legacy vs Modern Dashboard */}
        {isLegacy ? (
           <div className="bg-[#080d18] border border-white/10 rounded-2xl p-6 sm:p-8 shadow-xl print:bg-white print:border-gray-200 text-white print:text-black">
              <h2 className="text-2xl font-bold mb-4">Relatório Legado</h2>
              <pre className="whitespace-pre-wrap font-sans text-sm text-gray-300 leading-relaxed print:text-gray-800">
                {report.custom_notes || 'Nenhuma nota disponível.'}
              </pre>
           </div>
        ) : (
           <ReportDashboard snapshot={snapshot!} />
        )}

        {/* Footer */}
        <div className="text-center pt-8 border-t border-white/5 print:border-gray-200 mt-12 print:mt-8">
          <p className="text-xs text-gray-600 print:text-gray-400 tracking-wider uppercase">Gerado com CRM Leilão Ágil</p>
        </div>

      </div>
    </div>
  );
}
