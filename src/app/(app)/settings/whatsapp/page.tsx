'use client';

import { useState, useEffect } from 'react';
import { Smartphone, LogOut, RefreshCw, AlertCircle, CheckCircle2 } from 'lucide-react';
import { checkWhatsAppStatus, connectWhatsApp, disconnectWhatsApp } from './actions';
import Image from 'next/image';

export default function WhatsAppSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [state, setState] = useState<string>('LOADING');
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [pollingTimeout, setPollingTimeout] = useState<NodeJS.Timeout | null>(null);

  useEffect(() => {
    loadStatus();
    return () => stopPolling();
  }, []);

  const stopPolling = () => {
    if (pollingTimeout) {
      clearTimeout(pollingTimeout);
      setPollingTimeout(null);
    }
  };

  const loadStatus = async () => {
    setLoading(true);
    const res = await checkWhatsAppStatus();
    if (res.success) {
      setState(res.state.toUpperCase());
    } else {
      setState('UNAUTHORIZED');
    }
    setLoading(false);
  };

  const handleConnect = async () => {
    setLoading(true);
    setError('');
    setQrCode(null);
    
    const res = await connectWhatsApp();
    if (res.success && res.qr) {
      setQrCode(res.qr);
      setState('QR_READY');
      
      // Começa polling rápido esperando escaneamento
      startPolling();
    } else {
      setError(res.error || 'Falha ao buscar QR Code. Verifique se a URL da API e API_KEY estão corretas nas variáveis de ambiente.');
      setState('ERROR');
    }
    setLoading(false);
  };

  const startPolling = () => {
    const poll = setTimeout(async () => {
      const res = await checkWhatsAppStatus();
      if (res.success && res.state.toUpperCase() === 'OPEN') {
         setState('OPEN');
         setQrCode(null);
      } else {
         startPolling();
      }
    }, 3000);
    setPollingTimeout(poll);
  };

  const handleDisconnect = async () => {
    if (!confirm('Deseja realmente desconectar o WhatsApp desta conta?')) return;
    setLoading(true);
    stopPolling();
    await disconnectWhatsApp();
    setQrCode(null);
    await loadStatus();
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white tracking-tight">WhatsApp (Evolution API)</h2>
        <p className="text-sm text-gray-400 mt-1">Conecte seu número de WhatsApp para trocar mensagens diretamente do CRM.</p>
      </div>

      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      <div className="bg-[#080d18] border border-white/10 rounded-2xl p-6 sm:p-8">
        {loading && state === 'LOADING' ? (
          <div className="flex flex-col items-center justify-center py-12">
            <RefreshCw className="w-8 h-8 text-blue-500 animate-spin mb-4" />
            <p className="text-sm text-gray-400">Verificando status de conexão...</p>
          </div>
        ) : (
          <div className="space-y-8">
            {/* Cabecalho de Status */}
            <div className="flex items-center gap-4 border-b border-white/10 pb-6">
               <div className={`w-16 h-16 rounded-2xl flex items-center justify-center shrink-0 ${state === 'OPEN' ? 'bg-emerald-500/20 shadow-[0_0_20px_rgba(16,185,129,0.2)]' : 'bg-gray-800'}`}>
                 <Smartphone className={`w-8 h-8 ${state === 'OPEN' ? 'text-emerald-500' : 'text-gray-500'}`} />
               </div>
               <div className="flex-1">
                 <h3 className="text-lg font-semibold text-white">Status da Conexão</h3>
                 <div className="flex items-center gap-2 mt-1">
                   <div className={`w-2.5 h-2.5 rounded-full ${state === 'OPEN' ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
                   <p className="text-sm text-gray-300">
                     {state === 'OPEN' ? 'Conectado e Operacional' : 
                      state === 'QR_READY' ? 'Aguardando Escaneamento...' : 
                      'Desconectado'}
                   </p>
                 </div>
               </div>
            </div>

            {/* Ações e Visualização */}
            <div className="flex flex-col items-center pt-2">
               {state === 'OPEN' ? (
                 <div className="text-center space-y-6 w-full">
                    <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-emerald-500/10 mb-2">
                       <CheckCircle2 className="w-10 h-10 text-emerald-500" />
                    </div>
                    <p className="text-sm text-gray-300">Seu WhatsApp está pronto para enviar e receber mensagens.</p>
                    <button 
                      onClick={handleDisconnect}
                      disabled={loading}
                      className="mt-4 flex items-center justify-center gap-2 px-6 py-3 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-xl font-medium transition-colors w-full sm:w-auto mx-auto border border-red-500/20"
                    >
                      <LogOut className="w-4 h-4" />
                      Desconectar Dispositivo
                    </button>
                 </div>
               ) : (
                 <div className="text-center space-y-6 w-full">
                    {qrCode ? (
                      <div className="space-y-6 flex flex-col items-center animate-fade-in">
                        <div className="p-4 bg-white rounded-xl shadow-xl border-4 border-[#080d18]">
                           <Image 
                             src={qrCode.startsWith('data:') ? qrCode : `data:image/png;base64,${qrCode}`} 
                             alt="QR Code" 
                             width={256} 
                             height={256} 
                             className="rounded"
                           />
                        </div>
                        <p className="text-sm text-gray-400 max-w-sm mx-auto">
                          Abra o WhatsApp no seu celular, vá em Aparelhos Conectados e aponte a câmera para o QR Code acima.
                        </p>
                        <button 
                          onClick={loadStatus}
                          className="flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300"
                        >
                           <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                           Atualizar Status Manualmente
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <p className="text-sm text-gray-400 max-w-sm mx-auto leading-relaxed">
                          Para integrar o mensageiro ao CRM, crie uma sessão e escaneie o código QR no seu celular.
                        </p>
                        <button 
                          onClick={handleConnect}
                          disabled={loading}
                          className="flex items-center justify-center gap-2 px-8 py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-semibold transition-all shadow-[0_0_20px_rgba(5,150,105,0.3)] hover:shadow-[0_0_30px_rgba(5,150,105,0.4)] w-full sm:w-auto mx-auto"
                        >
                          {loading ? (
                            <><RefreshCw className="w-5 h-5 animate-spin" /> Conectando API...</>
                          ) : (
                            <><Smartphone className="w-5 h-5" /> Gerar QR Code do WhatsApp</>
                          )}
                        </button>
                      </div>
                    )}
                 </div>
               )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
