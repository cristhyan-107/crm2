'use client';

import { Printer } from 'lucide-react';

interface PrintButtonProps {
  token?: string;
  isPublicRoute?: boolean;
  variant?: 'icon' | 'full';
}

export function PrintButton({ token, isPublicRoute = false, variant = 'icon' }: PrintButtonProps) {
  const handlePrint = () => {
    if (isPublicRoute) {
      window.print();
    } else if (token) {
      const url = `/r/${token}`;
      const newWindow = window.open(url, '_blank');
      if (newWindow) {
        newWindow.onload = () => {
          setTimeout(() => {
            newWindow.print();
          }, 500);
        };
      }
    }
  };

  if (variant === 'full') {
    return (
      <button
        onClick={handlePrint}
        className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg font-medium transition-colors print:hidden"
      >
        <Printer className="w-4 h-4" />
        Gerar PDF
      </button>
    );
  }

  return (
    <button
      onClick={handlePrint}
      className="inline-flex items-center justify-center p-2 bg-white/5 hover:bg-white/10 text-gray-300 rounded-lg transition-colors border border-white/10 print:hidden"
      title="Gerar PDF"
    >
      <Printer className="w-4 h-4" />
    </button>
  );
}
