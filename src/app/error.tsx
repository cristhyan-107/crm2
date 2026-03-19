'use client';

import { useEffect } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import Link from 'next/link';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Global error:', error);
  }, [error]);

  return (
    <div className="flex items-center justify-center min-h-screen bg-[#060a14]">
      <div className="text-center space-y-4 max-w-md px-4">
        <div className="w-14 h-14 rounded-2xl bg-red-500/10 flex items-center justify-center mx-auto">
          <AlertTriangle className="w-7 h-7 text-red-400" />
        </div>
        <h2 className="text-xl font-semibold text-white">Erro no servidor</h2>
        <p className="text-sm text-gray-400">
          Ocorreu um erro inesperado. Tente recarregar a página ou volte ao início.
        </p>
        <div className="flex gap-3 justify-center">
          <button
            onClick={reset}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Tentar novamente
          </button>
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-white/10 text-gray-400 hover:bg-white/5 text-sm font-medium transition-colors"
          >
            <Home className="w-4 h-4" />
            Início
          </Link>
        </div>
      </div>
    </div>
  );
}
