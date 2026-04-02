'use client';

import { ReportSnapshot } from '@/lib/types/reports';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  ResponsiveContainer, Cell, LineChart, Line, PieChart, Pie
} from 'recharts';

interface Props {
  snapshot: ReportSnapshot;
}

export function ReportCharts({ snapshot }: Props) {
  // Chart 1: Leads por imóvel (Top 5)
  const topProperties = [...snapshot.properties].sort((a,b) => b.leadsCount - a.leadsCount).slice(0, 5);
  
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      
      {/* Gráfico de Evolução (Line) */}
      <div className="bg-white/5 border border-white/10 rounded-2xl p-6 lg:col-span-2 print:border-gray-200 print:bg-white print:shadow-sm">
        <h3 className="text-sm font-semibold text-gray-200 mb-6 print:text-gray-800">Evolução de Leads (Entrada)</h3>
        <div className="h-64">
          {snapshot.leadsEvolution.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={snapshot.leadsEvolution} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis dataKey="date" tick={{ fill: '#6b7fa3', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#6b7fa3', fontSize: 11 }} axisLine={false} tickLine={false} />
                <RechartsTooltip 
                  contentStyle={{ backgroundColor: '#0d1220', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#fff' }}
                  itemStyle={{ color: '#60a5fa' }}
                />
                <Line type="monotone" dataKey="count" name="Leads" stroke="#60a5fa" strokeWidth={3} dot={{ fill: '#3b82f6', strokeWidth: 2 }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-sm text-gray-500">Sem dados de evolução</div>
          )}
        </div>
      </div>

      {/* Funil de Distribuição (Pie/Bar Horizontal) */}
      <div className="bg-white/5 border border-white/10 rounded-2xl p-6 print:border-gray-200 print:bg-white print:shadow-sm">
        <h3 className="text-sm font-semibold text-gray-200 mb-6 print:text-gray-800">Distribuição do Funil</h3>
        <div className="h-64 flex items-center justify-center">
          {snapshot.funnelData.length > 0 ? (
             <ResponsiveContainer width="100%" height="100%">
               <PieChart>
                 <Pie
                   data={snapshot.funnelData}
                   cx="50%"
                   cy="50%"
                   innerRadius={60}
                   outerRadius={80}
                   paddingAngle={5}
                   dataKey="value"
                   stroke="none"
                 >
                   {snapshot.funnelData.map((entry, index) => (
                     <Cell key={`cell-${index}`} fill={entry.fill} />
                   ))}
                 </Pie>
                 <RechartsTooltip 
                   contentStyle={{ backgroundColor: '#0d1220', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#fff' }}
                   itemStyle={{ color: '#fff' }}
                 />
               </PieChart>
             </ResponsiveContainer>
          ) : (
            <div className="text-sm text-gray-500">Funil Vazio</div>
          )}
        </div>
        {/* Sub-legenda simplificada */}
        <div className="mt-2 flex flex-wrap gap-2 justify-center">
          {snapshot.funnelData.map(f => (
             <span key={f.name} className="text-[10px] flex items-center gap-1 text-gray-400 print:text-gray-600">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: f.fill }}></span>
                {f.name}
             </span>
          ))}
        </div>
      </div>

      {/* Gráfico Imóveis (Bar) */}
      <div className="bg-white/5 border border-white/10 rounded-2xl p-6 lg:col-span-3 print:border-gray-200 print:bg-white print:shadow-sm">
        <h3 className="text-sm font-semibold text-gray-200 mb-6 print:text-gray-800">Leads por Imóvel (Top 5)</h3>
        <div className="h-64">
           {topProperties.length > 0 ? (
             <ResponsiveContainer width="100%" height="100%">
               <BarChart data={topProperties} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                 <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                 <XAxis dataKey="code" tick={{ fill: '#6b7fa3', fontSize: 11 }} axisLine={false} tickLine={false} />
                 <YAxis tick={{ fill: '#6b7fa3', fontSize: 11 }} axisLine={false} tickLine={false} />
                 <RechartsTooltip 
                  cursor={{ fill: 'rgba(255,255,255,0.02)' }}
                  contentStyle={{ backgroundColor: '#0d1220', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#fff' }}
                 />
                 <Bar dataKey="leadsCount" name="Leads" radius={[4, 4, 0, 0]} barSize={40}>
                    {topProperties.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill="#a855f7" />
                    ))}
                 </Bar>
               </BarChart>
             </ResponsiveContainer>
           ) : (
            <div className="h-full flex items-center justify-center text-sm text-gray-500">Sem leads vinculados</div>
           )}
        </div>
      </div>

    </div>
  );
}
