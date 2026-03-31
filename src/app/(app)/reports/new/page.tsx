'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { ArrowLeft, BarChart3, Users, Calendar, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';

type Property = { id: string; title: string; code: string; status: string };

type StatusCounts = {
  new: number;
  contacted: number;
  credit_approved: number;
  scheduled_visit: number;
  visited: number;
  proposal: number;
  negotiating: number;
  [key: string]: number;
};

type PropertyStats = {
  leads: number;
  visits: number;
  statusCounts: StatusCounts;
  generatedSale: boolean;
};

const statusLabels: Record<string, string> = {
  new: 'Novos',
  contacted: 'Em Contato',
  credit_approved: 'Com Crédito',
  scheduled_visit: 'Agendou Visita',
  visited: 'Visitou',
  proposal: 'Proposta',
  negotiating: 'Negociando',
};

export default function NewReportPage() {
  const router = useRouter();
  const supabase = createClient();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [properties, setProperties] = useState<Property[]>([]);
  
  const [selectedPropertyIds, setSelectedPropertyIds] = useState<string[]>([]);
  const [statsMap, setStatsMap] = useState<Record<string, PropertyStats>>({});
  const [fetchingStats, setFetchingStats] = useState(false);

  useEffect(() => {
    supabase.from('properties')
      .select('id, title, code, status')
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        if (data) setProperties(data);
      });
  }, []);

  useEffect(() => {
    if (selectedPropertyIds.length === 0) {
      setStatsMap({});
      return;
    }

    const fetchAllStats = async () => {
      setFetchingStats(true);
      try {
        const newStatsMap: Record<string, PropertyStats> = {};
        
        for (const propId of selectedPropertyIds) {
          const prop = properties.find(p => p.id === propId);
          const generatedSale = prop ? prop.status === 'sold' : false;

          const [leadsRes, visitsRes] = await Promise.all([
            supabase.from('leads').select('id, status').eq('property_id', propId),
            supabase.from('visits').select('id', { count: 'exact', head: true }).eq('property_id', propId)
          ]);
          
          const leads = leadsRes.data || [];
          const statusCounts: StatusCounts = {
            new: 0, contacted: 0, credit_approved: 0, scheduled_visit: 0, 
            visited: 0, proposal: 0, negotiating: 0
          };
          
          leads.forEach(lead => {
            if (lead.status in statusCounts) {
              statusCounts[lead.status]++;
            } else {
              statusCounts[lead.status] = 1;
            }
          });

          newStatsMap[propId] = {
            leads: leads.length,
            visits: visitsRes.count || 0,
            statusCounts,
            generatedSale
          };
        }
        
        setStatsMap(newStatsMap);
      } catch (err) {
        console.error('Error fetching stats:', err);
      } finally {
        setFetchingStats(false);
      }
    };

    fetchAllStats();
  }, [selectedPropertyIds, properties]);

  const togglePropertySelection = (propId: string) => {
    setSelectedPropertyIds(prev => 
      prev.includes(propId) ? prev.filter(id => id !== propId) : [...prev, propId]
    );
  };

  const updateGeneratedSale = (propId: string, value: boolean) => {
    setStatsMap(prev => ({
      ...prev,
      [propId]: { ...prev[propId], generatedSale: value }
    }));
  };

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (selectedPropertyIds.length === 0) {
      setError('Selecione pelo menos um imóvel para gerar o relatório.');
      return;
    }

    setLoading(true);
    setError('');

    const form = new FormData(e.currentTarget);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setError('Você precisa estar logado.'); setLoading(false); return; }

    const customNotes = form.get('custom_notes') as string;
    
    try {
      let combinedReportContent = '';

      for (const propId of selectedPropertyIds) {
        const stats = statsMap[propId];
        if (!stats) continue;
        
        const prop = properties.find(p => p.id === propId);
        if (!prop) continue;
        
        const statusDetails = Object.entries(stats.statusCounts)
          .filter(([_, count]) => count > 0)
          .map(([status, count]) => `- ${statusLabels[status] || status}: ${count}`)
          .join('\n');

        const singleReportContent = `
=== RESUMO DO IMÓVEL: ${prop.code} - ${prop.title} ===
Leads totais captados: ${stats.leads}
Visitas agendadas: ${stats.visits}

=== FUNIL DOS LEADS ===
${statusDetails || 'Nenhum lead registrado.'}

Gerou venda? ${stats.generatedSale ? 'SIM' : 'NÃO'}`.trim();

        combinedReportContent += singleReportContent + '\n\n';

        if (stats.generatedSale && prop.status !== 'sold') {
          await supabase.from('properties').update({ status: 'sold' }).eq('id', propId);
        }
      }

      combinedReportContent += `
=== INFORMAÇÕES EXTRAS ===
${customNotes || 'Nenhuma informação extra fornecida.'}
`.trim();

      const { error: insertError } = await supabase.from('reports').insert({
        user_id: user.id,
        property_id: selectedPropertyIds.length === 1 ? selectedPropertyIds[0] : null,
        custom_notes: combinedReportContent.trim(),
      });

      if (insertError) throw insertError;

      router.push('/reports');
      router.refresh();
    } catch (err: any) {
      setError(err.message || 'Erro ao gerar relatórios');
      setLoading(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-fade-in">
      <div className="flex items-center gap-3">
        <Link href="/reports" className="p-2 rounded-lg hover:bg-white/5 transition-colors">
          <ArrowLeft className="w-5 h-5 text-gray-400" />
        </Link>
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight">Gerar Relatório</h2>
          <p className="text-sm text-gray-400 mt-0.5">Relatórios de desempenho e atividades dos imóveis</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="bg-[#080d18] border border-white/10 rounded-xl p-6 space-y-6">
        {error && (
          <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">{error}</div>
        )}

        <div className="space-y-3">
          <label className="text-sm font-medium text-gray-300">Selecione os Imóveis *</label>
          <div className="max-h-64 overflow-y-auto space-y-2 border border-white/10 rounded-lg p-2 bg-[#0a0f1c]">
            {properties.map(p => (
              <div key={p.id} className="flex items-center gap-3 p-2 hover:bg-white/5 rounded-md transition-colors cursor-pointer" onClick={() => togglePropertySelection(p.id)}>
                <input 
                  type="checkbox" 
                  checked={selectedPropertyIds.includes(p.id)}
                  onChange={() => {}}
                  className="w-4 h-4 rounded border-white/20 bg-transparent text-blue-500 focus:ring-blue-500/40"
                />
                <span className="text-sm text-gray-300">
                  {p.code} — {p.title} {p.status === 'sold' ? '(Vendido)' : ''}
                </span>
              </div>
            ))}
            {properties.length === 0 && (
              <p className="text-sm text-gray-500 p-2 text-center">Nenhum imóvel disponível</p>
            )}
          </div>
        </div>

        {selectedPropertyIds.length > 0 && (
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-blue-400 flex items-center gap-2 border-b border-white/10 pb-2">
              <BarChart3 className="w-4 h-4" /> Resumo dos Imóveis Selecionados ({selectedPropertyIds.length})
            </h3>
            
            {fetchingStats ? (
              <div className="text-sm text-gray-500 animate-pulse">Calculando estatísticas...</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {selectedPropertyIds.map(propId => {
                  const prop = properties.find(p => p.id === propId);
                  const stats = statsMap[propId];
                  if (!prop || !stats) return null;

                  return (
                    <div key={propId} className="p-4 rounded-xl bg-blue-500/5 border border-blue-500/10 space-y-4">
                      <h4 className="text-sm font-medium text-white truncate" title={prop.title}>{prop.code} - {prop.title}</h4>
                      
                      <div className="grid grid-cols-2 gap-2">
                        <div className="flex items-center gap-2 bg-[#0a0f1c] p-2 rounded-lg border border-white/5">
                          <Users className="w-4 h-4 text-blue-400" />
                          <div>
                            <p className="text-[10px] text-gray-500 uppercase">Leads</p>
                            <p className="text-sm font-semibold text-white">{stats.leads}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 bg-[#0a0f1c] p-2 rounded-lg border border-white/5">
                          <Calendar className="w-4 h-4 text-emerald-400" />
                          <div>
                            <p className="text-[10px] text-gray-500 uppercase">Visitas</p>
                            <p className="text-sm font-semibold text-white">{stats.visits}</p>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-1">
                        <p className="text-[10px] text-gray-500 uppercase font-medium">Funil ({stats.leads} total)</p>
                        <div className="flex flex-wrap gap-1.5">
                          {Object.entries(stats.statusCounts).map(([status, count]) => {
                            if (count === 0) return null;
                            return (
                              <span key={status} className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-white/5 text-gray-300 border border-white/10">
                                {statusLabels[status] || status}: <span className="ml-1 text-white">{count}</span>
                              </span>
                            );
                          })}
                          {Object.values(stats.statusCounts).every(v => v === 0) && (
                            <span className="text-xs text-gray-500">Nenhum lead registrado</span>
                          )}
                        </div>
                      </div>

                      <div className="pt-2 border-t border-white/5 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className={`w-3 h-3 ${stats.generatedSale ? 'text-emerald-400' : 'text-gray-500'}`} />
                          <span className="text-xs text-gray-300">Gerou venda?</span>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input 
                            type="checkbox" 
                            className="sr-only peer" 
                            checked={stats.generatedSale}
                            onChange={(e) => updateGeneratedSale(propId, e.target.checked)}
                          />
                          <div className="w-9 h-5 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500"></div>
                        </label>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        <div className="space-y-1.5">
          <label className="text-sm font-medium text-gray-300">Informações Extras (Aplicado a todos)</label>
          <textarea 
            name="custom_notes" 
            rows={4} 
            placeholder="Adicione informações adicionais que deseja incluir nos relatórios..."
            className="w-full px-3.5 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/40 transition-all resize-none" 
          />
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Link href="/reports"
            className="px-4 py-2.5 rounded-lg border border-white/10 text-gray-400 hover:bg-white/5 transition-colors font-medium">
            Cancelar
          </Link>
          <button type="submit" disabled={loading || selectedPropertyIds.length === 0}
            className="px-6 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium transition-colors">
            {loading ? 'Gerando...' : `Gerar Relatório${selectedPropertyIds.length > 1 ? 's' : ''}`}
          </button>
        </div>
      </form>
    </div>
  );
}
