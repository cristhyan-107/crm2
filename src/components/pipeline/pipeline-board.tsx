'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Plus, Filter } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';

type Lead = {
  id: string;
  name: string;
  status: string;
  temperature: string;
  phone: string;
  source: string;
  property_id: string | null;
  properties?: { title: string } | null;
};

type PipelineBoardProps = {
  initialLeads: Lead[];
  properties: { id: string; title: string }[];
};

export default function PipelineBoard({ initialLeads, properties }: PipelineBoardProps) {
  const [leads, setLeads] = useState<Lead[]>(initialLeads);
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>('all');
  const supabase = createClient();

  const columns = [
    { id: 'new', title: 'Novos', color: 'bg-blue-500' },
    { id: 'contacted', title: 'Em Contato', color: 'bg-purple-500' },
    { id: 'scheduled_visit', title: 'Agendou Visita', color: 'bg-indigo-500' },
    { id: 'visited', title: 'Visitou', color: 'bg-orange-500' },
    { id: 'proposal', title: 'Proposta', color: 'bg-yellow-500' },
    { id: 'negotiating', title: 'Negociando', color: 'bg-pink-500' },
  ];

  // Drag and Drop handlers
  const handleDragStart = (e: React.DragEvent, leadId: string) => {
    e.dataTransfer.setData('leadId', leadId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault(); // Necessário para permitir o drop
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = async (e: React.DragEvent, targetColumnId: string) => {
    e.preventDefault();
    const leadId = e.dataTransfer.getData('leadId');
    if (!leadId) return;

    const leadToMove = leads.find((l) => l.id === leadId);
    if (!leadToMove || leadToMove.status === targetColumnId) return;

    // Optimistic UI update
    const previousLeads = [...leads];
    setLeads((currentLeads) =>
      currentLeads.map((lead) =>
        lead.id === leadId ? { ...lead, status: targetColumnId } : lead
      )
    );

    // Call Supabase update
    try {
      const { error } = await supabase
        .from('leads')
        .update({ status: targetColumnId })
        .eq('id', leadId);

      if (error) throw error;
      toast.success('Card movido com sucesso');
    } catch (error: any) {
      // Revert if error
      setLeads(previousLeads);
      toast.error('Erro ao mover lead: ' + error.message);
    }
  };

  // Filter logic
  const filteredLeads = leads.filter((lead) => {
    if (selectedPropertyId === 'all') return true;
    return lead.property_id === selectedPropertyId;
  });

  return (
    <div className="flex-1 flex flex-col space-y-6 overflow-hidden">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-fade-in shrink-0">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight">Pipeline</h2>
          <p className="text-sm text-gray-400 mt-1">Kanban visual do seu funil de vendas</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-[#080d18] border border-white/10 rounded-lg px-3 py-2">
            <Filter className="w-4 h-4 text-gray-400" />
            <select
              value={selectedPropertyId}
              onChange={(e) => setSelectedPropertyId(e.target.value)}
              className="bg-transparent text-sm text-white focus:outline-none focus:ring-0 [&>option]:bg-[#080d18]"
            >
              <option value="all">Todos os móveis</option>
              {properties.map((prop) => (
                <option key={prop.id} value={prop.id}>
                  {prop.title}
                </option>
              ))}
            </select>
          </div>
          <Link
            href="/leads/new"
            className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
          >
            <Plus className="w-4 h-4" />
            Novo Lead
          </Link>
        </div>
      </div>

      <div className="flex-1 flex gap-6 overflow-x-auto pb-4 snap-x animate-slide-up">
        {columns.map((column) => {
          const columnLeads = filteredLeads.filter((l) => l.status === column.id);
          return (
            <div
              key={column.id}
              className="flex-shrink-0 w-80 flex flex-col snap-center"
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, column.id)}
            >
              <div className="flex items-center justify-between mb-4 px-1 shrink-0">
                <div className="flex items-center gap-2">
                  <div className={`w-2.5 h-2.5 rounded-full ${column.color}`} />
                  <h3 className="font-semibold text-gray-200">{column.title}</h3>
                </div>
                <span className="text-xs font-medium text-gray-500 bg-white/5 px-2 py-0.5 rounded-full border border-white/10">
                  {columnLeads.length}
                </span>
              </div>

              <div className="flex-1 bg-[#080d18] border border-white/5 rounded-xl p-3 flex flex-col gap-3 overflow-y-auto">
                {columnLeads.map((lead) => (
                  <div
                    key={lead.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, lead.id)}
                    className="bg-white/[0.03] border border-white/10 rounded-lg p-3.5 hover:bg-white/[0.05] transition-colors cursor-grab active:cursor-grabbing group shadow-sm"
                  >
                    <div className="flex justify-between items-start mb-2">
                      <h4 className="font-medium text-gray-200 text-sm group-hover:text-blue-400 transition-colors">
                        {lead.name}
                      </h4>
                      <span
                        className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${
                          lead.temperature === 'hot'
                            ? 'bg-orange-500 shadow-[0_0_8px_rgba(249,115,22,0.5)]'
                            : lead.temperature === 'warm'
                            ? 'bg-yellow-500 shadow-[0_0_8px_rgba(234,179,8,0.5)]'
                            : 'bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]'
                        }`}
                        title={`Temperatura: ${lead.temperature}`}
                      />
                    </div>
                    {lead.properties && (
                      <p
                        className="text-xs text-gray-400 mb-3 truncate"
                        title={lead.properties.title}
                      >
                        {lead.properties.title}
                      </p>
                    )}
                    <div className="flex items-center justify-between mt-auto">
                      <p className="text-xs text-gray-500">{lead.phone}</p>
                      <span className="text-[10px] text-gray-500 uppercase font-medium bg-white/5 px-1.5 py-0.5 rounded">
                        {lead.source}
                      </span>
                    </div>
                  </div>
                ))}
                {columnLeads.length === 0 && (
                  <div className="h-24 flex items-center justify-center border-2 border-dashed border-white/5 rounded-lg text-sm text-gray-600">
                    Solte aqui
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
