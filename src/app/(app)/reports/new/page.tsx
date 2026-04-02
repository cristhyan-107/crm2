'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { ArrowLeft, BarChart3, Calendar as CalendarIcon, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';
import { generateReportSnapshot } from '@/lib/reports-engine';
import { ReportConfig } from '@/lib/types/reports';

type Property = { id: string; title: string; code: string; status: string };

export default function NewReportPage() {
  const router = useRouter();
  const supabase = createClient();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [properties, setProperties] = useState<Property[]>([]);
  
  const [selectedPropertyIds, setSelectedPropertyIds] = useState<string[]>([]);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  useEffect(() => {
    supabase.from('properties')
      .select('id, title, code, status')
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        if (data) setProperties(data);
      });
  }, []);

  const togglePropertySelection = (propId: string) => {
    setSelectedPropertyIds(prev => 
      prev.includes(propId) ? prev.filter(id => id !== propId) : [...prev, propId]
    );
  };

  const selectAll = () => {
    if (selectedPropertyIds.length === properties.length) {
      setSelectedPropertyIds([]);
    } else {
      setSelectedPropertyIds(properties.map(p => p.id));
    }
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
      const config: ReportConfig = {
        propertyIds: selectedPropertyIds,
        startDate: startDate || undefined,
        endDate: endDate || undefined
      };

      const snapshot = await generateReportSnapshot(supabase, config);

      if (customNotes) {
        snapshot.customNotes = customNotes;
      }

      // Generate the report row
      const { error: insertError } = await supabase.from('reports').insert({
        user_id: user.id,
        property_id: selectedPropertyIds.length === 1 ? selectedPropertyIds[0] : null,
        custom_notes: customNotes, // Kept for backwards compatibility
        config: config as any,
        snapshot: snapshot as any,
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
          <h2 className="text-2xl font-bold text-white tracking-tight">Gerar Relatório Estratégico</h2>
          <p className="text-sm text-gray-400 mt-0.5">Configure os filtros para gerar o dashboard de métricas</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="bg-[#080d18] border border-white/10 rounded-xl p-6 space-y-8">
        {error && (
          <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-red-400" />
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-300 flex items-center gap-2">
              <CalendarIcon className="w-4 h-4 text-blue-400" />
              Data Inicial (Opcional)
            </label>
            <input 
              type="date" 
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              className="w-full bg-[#0a0f1c] border border-white/10 px-3 py-2 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500/40"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-300 flex items-center gap-2">
              <CalendarIcon className="w-4 h-4 text-blue-400" />
              Data Final (Opcional)
            </label>
            <input 
              type="date"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              className="w-full bg-[#0a0f1c] border border-white/10 px-3 py-2 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500/40"
            />
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-gray-300">Imóveis Analisados *</label>
            <button 
              type="button" 
              onClick={selectAll}
              className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
            >
              {selectedPropertyIds.length === properties.length ? 'Desmarcar Todos' : 'Selecionar Todos'}
            </button>
          </div>
          <div className="max-h-64 overflow-y-auto space-y-1.5 border border-white/10 rounded-lg p-2 bg-[#0a0f1c]">
            {properties.map(p => (
              <div 
                key={p.id} 
                className="flex items-center gap-3 p-2.5 hover:bg-white/5 rounded-md transition-colors cursor-pointer border border-transparent hover:border-white/5" 
                onClick={() => togglePropertySelection(p.id)}
              >
                <input 
                  type="checkbox" 
                  checked={selectedPropertyIds.includes(p.id)}
                  onChange={() => {}}
                  className="w-4 h-4 rounded border-white/20 bg-transparent text-blue-500 focus:ring-blue-500/40"
                />
                <span className="text-sm text-gray-300 flex-1">
                  <span className="font-medium text-gray-200">{p.code}</span> — {p.title}
                </span>
                {p.status === 'sold' && (
                  <span className="text-[10px] font-medium text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" />
                    Vendido
                  </span>
                )}
              </div>
            ))}
            {properties.length === 0 && (
              <p className="text-sm text-gray-500 p-4 text-center">Nenhum imóvel cadastrado no CRM</p>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-300">Resumo Executivo (Observações Manuais)</label>
          <textarea 
            name="custom_notes" 
            rows={4} 
            placeholder="Se desejar, adicione comentários gerais para a diretoria, clientes ou parceiros que aparecerão no relatório final..."
            className="w-full px-3.5 py-2.5 bg-[#0a0f1c] border border-white/10 rounded-lg text-white placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/40 transition-all resize-none" 
          />
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t border-white/10">
          <Link href="/reports"
            className="px-4 py-2.5 rounded-lg border border-white/10 text-gray-400 hover:bg-white/5 transition-colors font-medium">
            Voltar
          </Link>
          <button type="submit" disabled={loading || selectedPropertyIds.length === 0}
            className="px-6 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium transition-colors shadow-[0_0_15px_rgba(37,99,235,0.3)]">
            {loading ? 'Processando Análise...' : `Gerar Dashboard Analítico`}
          </button>
        </div>
      </form>
    </div>
  );
}
